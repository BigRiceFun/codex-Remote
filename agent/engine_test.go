package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

type bufferWriteCloser struct {
	bytes.Buffer
}

func (b *bufferWriteCloser) Close() error { return nil }

func TestAppServerDecision(t *testing.T) {
	tests := map[string]string{
		"allow_once":   "accept",
		"allow_always": "acceptForSession",
		"deny":         "decline",
		"unknown":      "",
	}
	for decision, want := range tests {
		if got := appServerDecision(decision); got != want {
			t.Fatalf("appServerDecision(%q) = %q, want %q", decision, got, want)
		}
	}
}

func TestRespondApprovalRequiresMatchingPendingRequest(t *testing.T) {
	stdin := &bufferWriteCloser{}
	rpc := &appServerTurn{in: stdin}
	e := &Engine{
		running:        true,
		currentSession: "session-1",
		stdin:          stdin,
		pendingApproval: &approvalRequest{
			id:      "approval-1",
			session: "session-1",
			rpcID:   []byte("42"),
			rpc:     rpc,
		},
	}

	if err := e.RespondApproval("session-1", "wrong-id", "allow_once"); err == nil {
		t.Fatal("expected mismatched approval id to fail")
	}
	if err := e.RespondApproval("session-1", "approval-1", "allow_always"); err != nil {
		t.Fatal(err)
	}
	if got := stdin.String(); got != "{\"id\":42,\"result\":{\"decision\":\"acceptForSession\"}}\n" {
		t.Fatalf("stdin = %q", got)
	}
	if e.pendingApproval != nil {
		t.Fatal("expected approval to be consumed")
	}
	if err := e.RespondApproval("session-1", "approval-1", "allow_always"); err == nil {
		t.Fatal("expected replayed approval to fail")
	}
}

func TestStructuredCommandApprovalIsRegistered(t *testing.T) {
	e := &Engine{currentClient: "7", agent: &Agent{}}
	rpc := &appServerTurn{in: &bufferWriteCloser{}}
	params, err := json.Marshal(map[string]any{
		"threadId": "session-1", "turnId": "turn-1", "itemId": "item-1",
		"command": "Get-Date", "cwd": `C:\work`, "startedAtMs": 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.handleAppServerApproval(rpc, appServerMessage{
		ID: []byte("99"), Method: "item/commandExecution/requestApproval", Params: params,
	}); err != nil {
		t.Fatal(err)
	}
	if e.pendingApproval == nil {
		t.Fatal("approval was not registered")
	}
	if e.pendingApproval.clientID != "7" || string(e.pendingApproval.rpcID) != "99" {
		t.Fatalf("pending approval = %#v", e.pendingApproval)
	}
	if !strings.Contains(e.pendingApproval.content, "Get-Date") {
		t.Fatalf("content = %q", e.pendingApproval.content)
	}
}
