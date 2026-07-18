package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// Engine runs one app-server turn at a time. If another message arrives while
// a turn is running, it is queued.
type Engine struct {
	mu sync.Mutex

	currentSession  string
	currentClient   string
	running         bool
	cmd             *exec.Cmd
	stdin           io.WriteCloser
	cancel          context.CancelFunc
	queue           []queueItem
	pendingApproval *approvalRequest
	approvalQueue   []approvalRequest

	// owner holding the input lock; released after 5m idle.
	owner      string
	ownerSince time.Time

	agent *Agent
}

type queueItem struct {
	session  string
	text     string
	clientID string
}

type approvalRequest struct {
	id       string
	session  string
	clientID string
	content  string
	rpcID    json.RawMessage
	kind     string
	rpc      *appServerTurn
}

const (
	maxQueuedMessages = 100
	maxMessageBytes   = 64 * 1024
)

func NewEngine(a *Agent) *Engine {
	return &Engine{agent: a}
}

func (e *Engine) Snapshot() *StatusPayload {
	e.mu.Lock()
	defer e.mu.Unlock()
	var cur *string
	if e.currentSession != "" {
		s := e.currentSession
		cur = &s
	}
	var own *string
	if e.owner != "" {
		o := e.owner
		own = &o
	}
	q := make([]string, 0, len(e.queue))
	for _, qi := range e.queue {
		q = append(q, qi.text)
	}
	return &StatusPayload{
		Running: e.running,
		Current: cur,
		Owner:   own,
		Queue:   q,
	}
}

func (e *Engine) EnqueueOrStart(session, text, who string) {
	if session == "" || text == "" {
		return
	}
	if len(text) > maxMessageBytes {
		e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: "message is too large"})
		return
	}
	e.mu.Lock()
	if e.owner == "" {
		e.owner = who
		e.ownerSince = time.Now()
	}
	if e.running {
		if len(e.queue) >= maxQueuedMessages {
			e.mu.Unlock()
			e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: "message queue is full"})
			return
		}
		e.queue = append(e.queue, queueItem{session: session, text: text, clientID: who})
		n := len(e.queue)
		e.mu.Unlock()
		e.publishStatus()
		e.agent.emit(AgentOutgoing{Type: "system", Session: session,
			Content: fmt.Sprintf("queued (%d in line)", n)})
		return
	}
	// Reserve the running slot while still holding the lock, so a second
	// incoming message can't race into start() and hit "context canceled".
	e.running = true
	e.currentSession = session
	e.currentClient = who
	e.mu.Unlock()

	e.start(session, text, who)
}

func (e *Engine) failStart(session, reason string, cancel context.CancelFunc) {
	e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: reason})
	cancel()
	e.mu.Lock()
	e.running = false
	e.currentSession = ""
	e.currentClient = ""
	var next *queueItem
	if len(e.queue) > 0 {
		n := e.queue[0]
		e.queue = e.queue[1:]
		e.running = true
		e.currentSession = n.session
		e.currentClient = n.clientID
		next = &n
	}
	e.mu.Unlock()
	e.publishStatus()

	if next != nil {
		time.Sleep(200 * time.Millisecond)
		n := *next
		e.start(n.session, n.text, n.clientID)
	}
}

func (e *Engine) start(session, text, clientID string) {
	ctx, cancel := context.WithCancel(e.agent.ctx)

	// Find the session's original working directory from the jsonl header,
	// otherwise fall back to the agent's own cwd.
	cwd := ""
	if s := findSessionByID(e.agent.snapshotSessions(), session); s != nil && s.CWD != "" {
		cwd = s.CWD
	}
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	cmd := exec.CommandContext(ctx, "codex", "app-server", "--stdio")
	hideConsoleWindow(cmd)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "CLICOLOR=0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		e.failStart(session, "stdout pipe: "+err.Error(), cancel)
		return
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		e.failStart(session, "stdin pipe: "+err.Error(), cancel)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		e.failStart(session, "stderr pipe: "+err.Error(), cancel)
		return
	}
	if err := cmd.Start(); err != nil {
		e.failStart(session, "start: "+err.Error(), cancel)
		return
	}
	rpc := &appServerTurn{in: stdin}

	e.mu.Lock()
	e.cmd = cmd
	e.stdin = stdin
	e.cancel = cancel
	e.currentSession = session
	e.currentClient = clientID
	e.running = true
	e.mu.Unlock()
	e.publishStatus()

	e.agent.emit(AgentOutgoing{Type: "system", Session: session, Content: "codex started (app-server)"})
	go copyAppServerErrors(stderr, e.agent.logf)
	go func() {
		runErr := runAppServerTurn(ctx, cmd, rpc, stdout, e, session, text, cwd)
		cancel()
		_ = cmd.Wait()
		e.onProcessEnd(session, runErr)
	}()
}

func (e *Engine) onProcessEnd(session string, waitErr error) {
	e.mu.Lock()
	e.running = false
	e.cmd = nil
	if e.stdin != nil {
		_ = e.stdin.Close()
		e.stdin = nil
	}
	e.pendingApproval = nil
	e.approvalQueue = nil
	if e.cancel != nil {
		e.cancel()
		e.cancel = nil
	}
	var next *queueItem
	if len(e.queue) > 0 {
		n := e.queue[0]
		e.queue = e.queue[1:]
		next = &n
	}
	if next == nil {
		e.currentSession = ""
		e.currentClient = ""
	} else {
		e.running = true
		e.currentSession = next.session
		e.currentClient = next.clientID
	}
	e.mu.Unlock()

	msg := "codex exited"
	if waitErr != nil {
		// `codex exec` returns non-zero on its own logic errors; surface but don't panic
		msg = "codex exited: " + waitErr.Error()
	}
	e.agent.emit(AgentOutgoing{Type: "system", Session: session, Content: msg})
	e.publishStatus()

	if next != nil {
		time.Sleep(200 * time.Millisecond)
		n := *next
		e.start(n.session, n.text, n.clientID)
	}
}

func (e *Engine) publishPendingApproval() {
	e.mu.Lock()
	if e.pendingApproval == nil {
		e.mu.Unlock()
		return
	}
	pending := *e.pendingApproval
	e.mu.Unlock()
	e.agent.emit(AgentOutgoing{
		Type:       "approval",
		Session:    pending.session,
		Content:    pending.content,
		ApprovalID: pending.id,
		ClientID:   pending.clientID,
	})
}

func (e *Engine) RespondApproval(session, approvalID, decision string) error {
	result := appServerDecision(decision)
	if result == "" {
		return fmt.Errorf("unknown approval decision: %s", decision)
	}
	e.mu.Lock()
	if !e.running || e.currentSession != session || e.pendingApproval == nil {
		e.mu.Unlock()
		return fmt.Errorf("no running approval target")
	}
	if e.pendingApproval.id != approvalID || e.pendingApproval.session != session {
		e.mu.Unlock()
		return fmt.Errorf("approval request does not match")
	}
	pending := *e.pendingApproval
	e.mu.Unlock()
	if pending.rpc == nil {
		return fmt.Errorf("approval transport is unavailable")
	}
	err := pending.rpc.respond(pending.rpcID, map[string]any{"decision": result})
	if err == nil {
		var next *approvalRequest
		e.mu.Lock()
		if e.pendingApproval != nil && e.pendingApproval.id == approvalID {
			e.pendingApproval = nil
			if len(e.approvalQueue) > 0 {
				n := e.approvalQueue[0]
				e.approvalQueue = e.approvalQueue[1:]
				e.pendingApproval = &n
				next = &n
			}
		}
		e.mu.Unlock()
		if next != nil {
			e.emitApproval(*next)
		}
	}
	return err
}

func (e *Engine) emitApproval(p approvalRequest) {
	e.agent.emit(AgentOutgoing{
		Type: "approval", Session: p.session, Content: p.content,
		ApprovalID: p.id, ClientID: p.clientID,
	})
}

func (e *Engine) publishStatus() {
	e.agent.emit(AgentOutgoing{Type: "status", Status: e.Snapshot()})
}

// OwnerTimeoutLoop releases owner lock after 5m of inactivity.
func (e *Engine) OwnerTimeoutLoop() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-e.agent.ctx.Done():
			return
		case <-t.C:
			e.mu.Lock()
			if e.owner != "" && time.Since(e.ownerSince) > 5*time.Minute && !e.running {
				e.owner = ""
			}
			e.mu.Unlock()
		}
	}
}

// SessionFileTailLoop watches jsonl files for the session currently selected
// by the browser. The worker tells us which session to watch via "watch".
//
// Per-session cursor: file path -> byte offset we've already sent.
var fileOffsets sync.Map

// watchedSessions contains the sessions currently selected by browser clients.
var watchedSessions []string
var watchedMu sync.Mutex

func setWatchedSessions(ids []string) {
	watchedMu.Lock()
	watchedSessions = append(watchedSessions[:0], ids...)
	watchedMu.Unlock()
}

func getWatchedSessions() []string {
	watchedMu.Lock()
	defer watchedMu.Unlock()
	return append([]string(nil), watchedSessions...)
}

func (e *Engine) SessionFileTailLoop() {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-e.agent.ctx.Done():
			return
		case <-t.C:
			for _, sid := range getWatchedSessions() {
				path := sessionFileByID(sid)
				if path != "" {
					e.tailFile(sid, path)
				}
			}
		}
	}
}

func (e *Engine) tailFile(session, path string) {
	// Skip tail while our own codex exec is running on the same session: stdout
	// already streams to the browser, and jsonl will be written by that same
	// process, so we'd just duplicate.
	e.mu.Lock()
	running := e.running && e.currentSession == session
	e.mu.Unlock()
	if running {
		// Still advance the offset so we don't dump backlog when exec finishes.
		if info, err := os.Stat(path); err == nil {
			fileOffsets.Store(session, info.Size())
		}
		return
	}

	info, err := os.Stat(path)
	if err != nil {
		return
	}
	prevAny, _ := fileOffsets.LoadOrStore(session, int64(0))
	prev, _ := prevAny.(int64)
	if info.Size() < prev {
		// file truncated / rotated
		prev = 0
	}
	if info.Size() == prev {
		return
	}
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	if _, err := f.Seek(prev, io.SeekStart); err != nil {
		return
	}
	br := bufio.NewReader(f)
	offset := prev
	var emitted int
	for {
		line, err := br.ReadString('\n')
		if line != "" {
			offset += int64(len(line))
			if role, text := extractMessage(line); role != "" && text != "" {
				kind := "user"
				if role == "assistant" {
					kind = "agent"
				}
				e.agent.emit(AgentOutgoing{
					Type:    kind,
					Session: session,
					Content: text,
				})
				emitted++
			}
		}
		if err != nil {
			break
		}
	}
	fileOffsets.Store(session, offset)
	if emitted > 0 {
		e.agent.logf("tail: session=%s emitted=%d newBytes=%d", session, emitted, offset-prev)
	}
}

// HandleIncoming parses messages coming from the worker.
func (e *Engine) HandleIncoming(raw []byte) {
	var m WorkerIncoming
	if err := json.Unmarshal(raw, &m); err != nil {
		return
	}
	switch m.Type {
	case "send":
		clientID := m.ClientID
		if clientID == "" {
			clientID = "web"
		}
		e.EnqueueOrStart(m.Session, m.Text, clientID)
	case "approval":
		err := e.RespondApproval(m.Session, m.ApprovalID, m.Decision)
		success := err == nil
		content := "approval accepted"
		if err != nil {
			content = err.Error()
		}
		e.agent.emit(AgentOutgoing{
			Type:       "approval_result",
			Session:    m.Session,
			Content:    content,
			ApprovalID: m.ApprovalID,
			Decision:   m.Decision,
			Success:    &success,
		})
	case "history":
		// worker is asking us to replay chat history for a session
		items := ReadHistory(m.Session)
		e.agent.logf("history: session=%s items=%d", m.Session, len(items))
		for _, it := range items {
			role := "user"
			if it.Role == "assistant" {
				role = "agent"
			}
			e.agent.emit(AgentOutgoing{
				Type:      "history",
				Session:   m.Session,
				Content:   role + "\u0001" + it.Content,
				RequestID: m.RequestID,
			})
		}
		e.agent.emit(AgentOutgoing{Type: "history_end", Session: m.Session, RequestID: m.RequestID})
	case "watch":
		setWatchedSessions(m.Sessions)
		for _, session := range m.Sessions {
			if path := sessionFileByID(session); path != "" {
				if info, err := os.Stat(path); err == nil {
					fileOffsets.Store(session, info.Size())
					e.agent.logf("watch: session=%s path=%s size=%d", session, path, info.Size())
				}
			} else {
				e.agent.logf("watch: session=%s no file found", session)
			}
		}
	}
}

func findSessionByID(list []Session, id string) *Session {
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}
