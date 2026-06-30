package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestExtractMessageSkipsAgentsInstructions(t *testing.T) {
	role, text := extractMessage(responseMessageLine("user", "AGENTS.md instructions\n<INSTRUCTIONS>\n���й����淶"))
	if role != "" || text != "" {
		t.Fatalf("expected injected instructions to be skipped, got role=%q text=%q", role, text)
	}
}

func TestParseSessionHeaderSkipsInjectedInstructions(t *testing.T) {
	const id = "12345678-1234-1234-1234-123456789abc"
	path := filepath.Join(t.TempDir(), "rollout-"+id+".jsonl")
	data := sessionMetaLine("D:\\ProjectAll\\codex-Remote") + "\n" +
		responseMessageLine("user", "AGENTS.md instructions\n<INSTRUCTIONS>\n���й����淶") + "\n" +
		responseMessageLine("user", "修复 worker UI 的主题切换") + "\n"
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}

	gotID, title, cwd := parseSessionHeader(path)
	if gotID != id {
		t.Fatalf("id = %q, want %q", gotID, id)
	}
	if title != "修复 worker UI 的主题切换" {
		t.Fatalf("title = %q", title)
	}
	if cwd != "D:\\ProjectAll\\codex-Remote" {
		t.Fatalf("cwd = %q", cwd)
	}
}

func TestShouldReplaceSessionTitle(t *testing.T) {
	if !shouldReplaceSessionTitle("AGENTS.md instructions", "session-id") {
		t.Fatal("expected injected title to be replaced")
	}
	if shouldReplaceSessionTitle("正常会话标题", "session-id") {
		t.Fatal("did not expect normal title to be replaced")
	}
}

func TestEnrichSessionsReplacesInjectedTitle(t *testing.T) {
	const id = "12345678-1234-1234-1234-123456789abc"
	path := filepath.Join(t.TempDir(), "rollout-"+id+".jsonl")
	data := responseMessageLine("user", "AGENTS.md instructions\n<INSTRUCTIONS>\n���й����淶") + "\n" +
		responseMessageLine("user", "连接 Agent 后清理会话标题") + "\n"
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}

	sessionIndexMu.Lock()
	oldIndex, oldTS := sessionIndex, sessionIndexTS
	sessionIndex = map[string]string{id: path}
	sessionIndexTS = time.Now()
	sessionIndexMu.Unlock()
	defer func() {
		sessionIndexMu.Lock()
		sessionIndex, sessionIndexTS = oldIndex, oldTS
		sessionIndexMu.Unlock()
	}()

	list := enrichSessions([]Session{{ID: id, Title: "AGENTS.md instructions"}})
	if len(list) != 1 || list[0].Title != "连接 Agent 后清理会话标题" {
		t.Fatalf("title = %#v", list)
	}
}

func responseMessageLine(role, text string) string {
	rec := struct {
		Type    string `json:"type"`
		Payload struct {
			Type    string `json:"type"`
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"payload"`
	}{Type: "response_item"}
	rec.Payload.Type = "message"
	rec.Payload.Role = role
	rec.Payload.Content = []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}{{Type: "input_text", Text: text}}
	b, _ := json.Marshal(rec)
	return string(b)
}

func sessionMetaLine(cwd string) string {
	rec := struct {
		Type    string `json:"type"`
		Payload struct {
			CWD string `json:"cwd"`
		} `json:"payload"`
	}{Type: "session_meta"}
	rec.Payload.CWD = cwd
	b, _ := json.Marshal(rec)
	return string(b)
}
