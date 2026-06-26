package main

import (
	"bufio"
	"context"
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

	currentSession string
	running        bool
	cmd            *exec.Cmd
	cancel         context.CancelFunc
	queue          []queueItem

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
	session string
	text    string
}

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
	e.mu.Lock()
	if e.owner == "" {
		e.owner = who
		e.ownerSince = time.Now()
	}
	if e.running {
		e.queue = append(e.queue, queueItem{session: session, text: text})
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
	e.mu.Unlock()

	e.start(session, text)
}

func (e *Engine) failStart(session, reason string, cancel context.CancelFunc) {
	e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: reason})
	cancel()
	e.mu.Lock()
	e.running = false
	e.currentSession = ""
	e.mu.Unlock()
	e.publishStatus()

	// If there's queued work, pump it.
	e.mu.Lock()
	if len(e.queue) > 0 {
		next := e.queue[0]
		e.queue = e.queue[1:]
		e.mu.Unlock()
		time.Sleep(200 * time.Millisecond)
		e.start(next.session, next.text)
	} else {
		e.mu.Unlock()
	}
}

func (e *Engine) start(session, text string) {
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
	cmd.Stdin = nil

	if err := cmd.Start(); err != nil {
		e.failStart(session, "start: "+err.Error(), cancel)
		return
	}

	e.mu.Lock()
	e.cmd = cmd
	e.cancel = cancel
	e.currentSession = session
	e.running = true
	e.echoSuppressed = false
	e.sentPrompt = text
	e.mu.Unlock()
	e.publishStatus()

	e.agent.emit(AgentOutgoing{Type: "system", Session: session, Content: "codex started"})

	go func() {
		br := bufio.NewReader(stdout)
		// Phase machine for codex exec stdout:
		//   "user"            -> start of echo block (user role marker)
		//   "<prompt>"        -> the prompt we sent (drop)
		//   "codex"           -> start of agent role (drop the marker itself)
		//   anything else     -> real content, stream it
		const (
			stInit = iota
			stInUserEcho // inside user block, skip
		)
		state := stInit
		for {
			line, err := br.ReadString('\n')
			if line != "" {
				clean := stripANSI(strings.TrimRight(line, "\r\n"))
				if clean == "" {
					continue
				}
				if state == stInit {
					if clean == "user" {
						state = stInUserEcho
						continue
					}
					// fall through to emit
				} else if state == stInUserEcho {
					// skip prompt echo + "codex" marker; once we see "codex"
					// we transition back to emitting.
					if clean == "codex" || clean == "assistant" {
						state = stInit
						continue
					}
					// still in user echo block
					continue
				}
				// Dedup adjacent identical lines.
				e.mu.Lock()
				last := e.lastStreamSent
				e.lastStreamSent = clean
				e.mu.Unlock()
				if clean == last {
					continue
				}
				e.agent.emit(AgentOutgoing{Type: "stream", Session: session, Content: clean})
			}
			if err != nil {
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
	} else {
		e.currentSession = next.session
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
		e.start(n.session, n.text)
	}
}

// PumpStdin is a no-op for non-interactive exec mode; kept for API compatibility.
func (e *Engine) PumpStdin(line string) error {
	return fmt.Errorf("non-interactive mode; message is auto-queued")
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

// watchedSession is the session id the browser is currently viewing.
var watchedSession string
var watchedMu sync.Mutex

func setWatchedSession(id string) {
	watchedMu.Lock()
	watchedSession = id
	watchedMu.Unlock()
}

func getWatchedSession() string {
	watchedMu.Lock()
	defer watchedMu.Unlock()
	return watchedSession
}

func (e *Engine) SessionFileTailLoop() {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-e.agent.ctx.Done():
			return
		case <-t.C:
			sid := getWatchedSession()
			if sid == "" {
				continue
			}
			path := sessionFileByID(sid)
			if path == "" {
				continue
			}
			e.tailFile(sid, path)
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
		e.EnqueueOrStart(m.Session, m.Text, "web")
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
				Type:    "history",
				Session: m.Session,
				Content: role + "\u0001" + it.Content,
			})
		}
		e.agent.emit(AgentOutgoing{Type: "system", Session: m.Session, Content: "--- end ---"})
	case "watch":
		setWatchedSession(m.Session)
		if path := sessionFileByID(m.Session); path != "" {
			if info, err := os.Stat(path); err == nil {
				fileOffsets.Store(m.Session, info.Size())
				e.agent.logf("watch: session=%s path=%s size=%d", m.Session, path, info.Size())
			}
		} else {
			e.agent.logf("watch: session=%s no file found", m.Session)
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
