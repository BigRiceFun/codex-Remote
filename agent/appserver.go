package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
)

type appServerTurn struct {
	mu     sync.Mutex
	in     io.WriteCloser
	turnID string
}

type appServerMessage struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  json.RawMessage `json:"error,omitempty"`
}

type appServerApprovalParams struct {
	ThreadID   string            `json:"threadId"`
	TurnID     string            `json:"turnId"`
	ItemID     string            `json:"itemId"`
	ApprovalID string            `json:"approvalId,omitempty"`
	Command    string            `json:"command,omitempty"`
	CWD        string            `json:"cwd,omitempty"`
	Reason     string            `json:"reason,omitempty"`
	Available  []json.RawMessage `json:"availableDecisions,omitempty"`
}

func (a *appServerTurn) send(value any) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	b = append(b, '\n')
	_, err = a.in.Write(b)
	return err
}

func (a *appServerTurn) respond(id json.RawMessage, result any) error {
	if len(id) == 0 {
		return fmt.Errorf("app-server request has no id")
	}
	var idValue any
	if err := json.Unmarshal(id, &idValue); err != nil {
		return err
	}
	return a.send(map[string]any{"id": idValue, "result": result})
}

func runAppServerTurn(ctx context.Context, cmd *exec.Cmd, rpc *appServerTurn, stdout io.Reader, e *Engine, session, text, cwd string) error {
	_ = cmd
	if err := rpc.send(map[string]any{
		"id": 1, "method": "initialize",
		"params": map[string]any{"clientInfo": map[string]string{"name": "codex-remote", "version": "1.0"}},
	}); err != nil {
		return err
	}

	stage := 1
	completed := false
	var turnErr error
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var m appServerMessage
		if err := json.Unmarshal(scanner.Bytes(), &m); err != nil {
			e.agent.logf("app-server invalid message: %v", err)
			continue
		}
		if m.Method != "" {
			switch m.Method {
			case "item/commandExecution/requestApproval", "item/fileChange/requestApproval":
				if err := e.handleAppServerApproval(rpc, m); err != nil {
					e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: "approval: " + err.Error()})
				}
			case "item/agentMessage/delta":
				var p struct{ ThreadID, TurnID, Delta string }
				if json.Unmarshal(m.Params, &p) == nil && p.ThreadID == session && p.Delta != "" {
					e.agent.emit(AgentOutgoing{Type: "stream", Session: session, Content: p.Delta})
				}
			case "turn/completed":
				var p struct {
					ThreadID string `json:"threadId"`
					Turn     struct {
						Status string `json:"status"`
						Error  *struct {
							Message string `json:"message"`
						} `json:"error"`
					} `json:"turn"`
				}
				if json.Unmarshal(m.Params, &p) == nil && p.ThreadID == session {
					completed = true
					if p.Turn.Error != nil && p.Turn.Error.Message != "" {
						turnErr = fmt.Errorf("%s", p.Turn.Error.Message)
					}
					goto done
				}
			case "error":
				var p struct {
					ThreadID string `json:"threadId"`
					Error    struct {
						Message string `json:"message"`
					} `json:"error"`
				}
				if json.Unmarshal(m.Params, &p) == nil && p.ThreadID == session && p.Error.Message != "" {
					e.agent.emit(AgentOutgoing{Type: "error", Session: session, Content: p.Error.Message})
				}
			}
			continue
		}
		if len(m.ID) == 0 {
			continue
		}
		if len(m.Error) > 0 && string(m.Error) != "null" {
			return fmt.Errorf("app-server request failed: %s", strings.TrimSpace(string(m.Error)))
		}
		switch stage {
		case 1:
			if err := rpc.send(map[string]any{"method": "initialized", "params": map[string]any{}}); err != nil {
				return err
			}
			if err := rpc.send(map[string]any{
				"id": 2, "method": "thread/resume",
				"params": map[string]any{"threadId": session, "cwd": cwd, "approvalPolicy": "on-request", "approvalsReviewer": "user"},
			}); err != nil {
				return err
			}
			stage = 2
		case 2:
			if err := rpc.send(map[string]any{
				"id": 3, "method": "turn/start",
				"params": map[string]any{
					"threadId":       session,
					"input":          []map[string]any{{"type": "text", "text": text, "text_elements": []any{}}},
					"approvalPolicy": "on-request", "approvalsReviewer": "user",
				},
			}); err != nil {
				return err
			}
			stage = 3
		case 3:
			var response struct {
				Turn struct {
					ID string `json:"id"`
				} `json:"turn"`
			}
			if json.Unmarshal(m.Result, &response) == nil {
				rpc.turnID = response.Turn.ID
			}
			stage = 4
		}
	}
done:
	if !completed {
		if err := scanner.Err(); err != nil {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("app-server stopped before the turn completed")
	}
	return turnErr
}

func copyAppServerErrors(r io.Reader, logf func(string, ...any)) {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 4096), 256*1024)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line != "" {
			logf("app-server: %s", line)
		}
	}
}

func (e *Engine) handleAppServerApproval(rpc *appServerTurn, m appServerMessage) error {
	var p appServerApprovalParams
	if err := json.Unmarshal(m.Params, &p); err != nil {
		return err
	}
	if p.ThreadID == "" || p.ItemID == "" {
		return fmt.Errorf("incomplete approval request")
	}
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	approvalID := hex.EncodeToString(buf)
	contentParts := []string{}
	if p.Command != "" {
		contentParts = append(contentParts, p.Command)
	}
	if p.Reason != "" {
		contentParts = append(contentParts, p.Reason)
	}
	if p.CWD != "" {
		contentParts = append(contentParts, "目录："+p.CWD)
	}
	if len(contentParts) == 0 {
		if m.Method == "item/fileChange/requestApproval" {
			contentParts = append(contentParts, "Codex 请求修改文件")
		} else {
			contentParts = append(contentParts, "Codex 请求执行命令")
		}
	}
	request := approvalRequest{
		id: approvalID, session: p.ThreadID,
		content: strings.Join(contentParts, "\n"), rpcID: append(json.RawMessage(nil), m.ID...),
		kind: m.Method, rpc: rpc,
	}
	emitNow := false
	e.mu.Lock()
	clientID := e.currentClient
	request.clientID = clientID
	if e.pendingApproval == nil {
		e.pendingApproval = &request
		emitNow = true
	} else {
		e.approvalQueue = append(e.approvalQueue, request)
	}
	e.mu.Unlock()
	if emitNow {
		e.emitApproval(request)
	}
	return nil
}

func appServerDecision(decision string) string {
	switch decision {
	case "allow", "allow_once", "yes":
		return "accept"
	case "allow_always", "always":
		return "acceptForSession"
	case "deny", "no":
		return "decline"
	default:
		return ""
	}
}
