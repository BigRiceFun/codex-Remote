package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Engine runs one `codex exec resume <id> "<text>"` at a time, streaming stdout
// to the worker. If another message arrives while one is running, it's queued.
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

	// owner holding the input lock; released after 5m idle.
	owner      string
	ownerSince time.Time

	// suppressEcho avoids sending the first lines of codex exec stdout that
	// just echo our prompt back. Decoded from stream goroutine.
	echoSuppressed bool
	sentPrompt     string
	// lastStreamSent dedups adjacent identical lines from codex exec stdout
	// (it sometimes prints the final answer twice when reasoning summaries
	// are off).
	lastStreamSent string

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

	args := []string{"exec", "resume", "--skip-git-repo-check", session, text}
	cmd := exec.CommandContext(ctx, "codex", args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "CLICOLOR=0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		e.failStart(session, "stdout pipe: "+err.Error(), cancel)
		return
	}
	cmd.Stderr = cmd.Stdout
	stdin, err := cmd.StdinPipe()
	if err != nil {
		e.failStart(session, "stdin pipe: "+err.Error(), cancel)
		return
	}

	if err := cmd.Start(); err != nil {
		e.failStart(session, "start: "+err.Error(), cancel)
		return
	}

	e.mu.Lock()
	e.cmd = cmd
	e.stdin = stdin
	e.cancel = cancel
	e.currentSession = session
	e.currentClient = clientID
	e.running = true
	e.echoSuppressed = false
	e.sentPrompt = text
	e.mu.Unlock()
	e.publishStatus()

	e.agent.emit(AgentOutgoing{Type: "system", Session: session, Content: "codex started"})

	go func() {
		// Phase machine for codex exec stdout:
		//   "user"            -> start of echo block (user role marker)
		//   "<prompt>"        -> the prompt we sent (drop)
		//   "codex"           -> start of agent role (drop the marker itself)
		//   anything else     -> real content, stream it
		const (
			stInit       = iota
			stInUserEcho // inside user block, skip
		)
		state := stInit
		processLine := func(line string) {
			clean := stripANSI(strings.TrimRight(line, "\r\n"))
			if clean == "" {
				return
			}
			if state == stInit {
				if clean == "user" {
					state = stInUserEcho
					return
				}
			} else if state == stInUserEcho {
				if clean == "codex" || clean == "assistant" {
					state = stInit
				}
				return
			}
			e.mu.Lock()
			last := e.lastStreamSent
			e.lastStreamSent = clean
			e.mu.Unlock()
			if clean == last {
				return
			}
			if isApprovalPrompt(clean) {
				approvalID, clientID, approvalErr := e.registerApproval(session, clean)
				if approvalErr != nil {
					e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: "approval id: " + approvalErr.Error()})
					return
				}
				e.agent.emit(AgentOutgoing{
					Type:       "approval",
					Session:    session,
					Content:    clean,
					ApprovalID: approvalID,
					ClientID:   clientID,
				})
				return
			}
			e.agent.emit(AgentOutgoing{Type: "stream", Session: session, Content: clean})
		}

		buf := make([]byte, 4096)
		pending := ""
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				pending += string(buf[:n])
				for {
					idx := strings.IndexByte(pending, '\n')
					if idx < 0 {
						break
					}
					processLine(pending[:idx+1])
					pending = pending[idx+1:]
				}
				if pending != "" && isApprovalPrompt(stripANSI(pending)) {
					processLine(pending)
					pending = ""
				}
			}
			if err != nil {
				if pending != "" {
					processLine(pending)
				}
				break
			}
		}
		waitErr := cmd.Wait()
		e.onProcessEnd(session, waitErr)
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

func isApprovalPrompt(line string) bool {
	lower := strings.ToLower(strings.TrimSpace(line))
	return strings.Contains(lower, "allow command") ||
		strings.Contains(lower, "allow this command") ||
		strings.Contains(lower, "would you like to run") ||
		strings.Contains(lower, "do you want to proceed") ||
		strings.Contains(lower, "approve command") ||
		strings.Contains(lower, "approval required") ||
		strings.Contains(lower, "requires approval")
}

func (e *Engine) registerApproval(session, content string) (string, string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	id := hex.EncodeToString(buf)
	e.mu.Lock()
	clientID := e.currentClient
	e.pendingApproval = &approvalRequest{id: id, session: session, clientID: clientID, content: content}
	e.mu.Unlock()
	return id, clientID, nil
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
	input := approvalInput(decision)
	if input == "" {
		return fmt.Errorf("unknown approval decision: %s", decision)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.running || e.currentSession != session || e.stdin == nil || e.pendingApproval == nil {
		return fmt.Errorf("no running approval target")
	}
	if e.pendingApproval.id != approvalID || e.pendingApproval.session != session {
		return fmt.Errorf("approval request does not match")
	}
	_, err := io.WriteString(e.stdin, input+"\n")
	if err == nil {
		e.pendingApproval = nil
	}
	return err
}

func approvalInput(decision string) string {
	switch decision {
	case "allow", "allow_once", "yes":
		return "y"
	case "allow_always", "always":
		return "a"
	case "deny", "no":
		return "n"
	default:
		return ""
	}
}

// PumpStdin is only used for explicit interactive approval responses.
func (e *Engine) PumpStdin(line string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stdin == nil {
		return fmt.Errorf("stdin is not available")
	}
	_, err := io.WriteString(e.stdin, line+"\n")
	return err
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

// stripANSI removes ANSI escape sequences so terminal-only control codes
// don't pollute the web view.
var ansiBuf []byte

func stripANSI(s string) string {
	if !strings.ContainsAny(s, "\x1b[") {
		return s
	}
	ansiBuf = ansiBuf[:0]
	inESC := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == 0x1b:
			inESC = true
		case inESC && c == '[':
			// CSI introducer consumed
		case inESC && (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'):
			inESC = false
		case inESC:
			// inside escape: skip
		default:
			ansiBuf = append(ansiBuf, c)
		}
	}
	return string(ansiBuf)
}
