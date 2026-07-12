package main

import (
	"bytes"
	"testing"
)

type bufferWriteCloser struct {
	bytes.Buffer
}

func (b *bufferWriteCloser) Close() error { return nil }

func TestApprovalInput(t *testing.T) {
	tests := map[string]string{
		"allow_once":   "y",
		"allow_always": "a",
		"deny":         "n",
		"unknown":      "",
	}
	for decision, want := range tests {
		if got := approvalInput(decision); got != want {
			t.Fatalf("approvalInput(%q) = %q, want %q", decision, got, want)
		}
	}
}

func TestRespondApprovalRequiresMatchingPendingRequest(t *testing.T) {
	stdin := &bufferWriteCloser{}
	e := &Engine{
		running:        true,
		currentSession: "session-1",
		stdin:          stdin,
		pendingApproval: &approvalRequest{
			id:      "approval-1",
			session: "session-1",
		},
	}

	if err := e.RespondApproval("session-1", "wrong-id", "allow_once"); err == nil {
		t.Fatal("expected mismatched approval id to fail")
	}
	if err := e.RespondApproval("session-1", "approval-1", "allow_always"); err != nil {
		t.Fatal(err)
	}
	if got := stdin.String(); got != "a\n" {
		t.Fatalf("stdin = %q, want %q", got, "a\n")
	}
	if e.pendingApproval != nil {
		t.Fatal("expected approval to be consumed")
	}
	if err := e.RespondApproval("session-1", "approval-1", "allow_always"); err == nil {
		t.Fatal("expected replayed approval to fail")
	}
}

func TestIsApprovalPrompt(t *testing.T) {
	for _, prompt := range []string{
		"Allow command?",
		"Allow this command to run?",
		"Would you like to run this command?",
		"Approval required",
	} {
		if !isApprovalPrompt(prompt) {
			t.Fatalf("expected %q to be recognized", prompt)
		}
	}
	if isApprovalPrompt("The command completed successfully") {
		t.Fatal("normal output should not be recognized as an approval prompt")
	}
}
