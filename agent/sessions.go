package main

import (
	"bufio"
	"encoding/json"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Session describes a Codex conversation shown in the sidebar.
type Session struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	CWD   string `json:"cwd,omitempty"`
}

// ListSessions discovers Codex sessions: first try `codex resume --list`,
// then fall back to scanning ~/.codex/sessions/YYYY/MM/DD/*.jsonl.
func ListSessions() []Session {
	if list, err := listViaResumeCLI(); err == nil && len(list) > 0 {
		return list
	}
	return listViaFilesystem()
}

func listViaResumeCLI() ([]Session, error) {
	bin, err := exec.LookPath("codex")
	if err != nil {
		return nil, err
	}
	out, err := exec.Command(bin, "resume", "--list").Output()
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(string(out))
	if strings.HasPrefix(trimmed, "[") {
		var parsed []Session
		if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil {
			return enrichSessions(parsed), nil
		}
	}
	var list []Session
	for _, line := range strings.Split(trimmed, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		s := Session{ID: parts[0]}
		if len(parts) == 2 {
			s.Title = strings.TrimSpace(parts[1])
		} else {
			s.Title = s.ID
		}
		list = append(list, s)
	}
	return enrichSessions(list), nil
}

func enrichSessions(list []Session) []Session {
	for i := range list {
		path := sessionFileByID(list[i].ID)
		if path == "" {
			continue
		}
		_, title, cwd := parseSessionHeader(path)
		if list[i].CWD == "" && cwd != "" {
			list[i].CWD = cwd
		}
		if shouldReplaceSessionTitle(list[i].Title, list[i].ID) && title != "" {
			list[i].Title = title
		}
	}
	return list
}

func codexDir() string {
	if v := os.Getenv("CODEX_HOME"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".codex"
	}
	return filepath.Join(home, ".codex")
}

func sessionsRoot() string {
	return filepath.Join(codexDir(), "sessions")
}

// listViaFilesystem walks ~/.codex/sessions/YYYY/MM/DD/*.jsonl
func listViaFilesystem() []Session {
	root := sessionsRoot()
	var files []string
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(info.Name()), ".jsonl") {
			files = append(files, path)
		}
		return nil
	})

	var sessions []Session
	for _, f := range files {
		id, title, cwd := parseSessionHeader(f)
		if id == "" {
			continue
		}
		sessions = append(sessions, Session{ID: id, Title: title, CWD: cwd})
	}
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].ID > sessions[j].ID
	})
	return sessions
}

// sessionFileByID finds the jsonl path for a session UUID.
// Maintains a cached index, rebuilt at most every 30s.
var (
	sessionIndexMu sync.Mutex
	sessionIndexTS time.Time
	sessionIndex   map[string]string
)

func sessionFileByID(id string) string {
	if id == "" {
		return ""
	}
	sessionIndexMu.Lock()
	defer sessionIndexMu.Unlock()
	if sessionIndex == nil || time.Since(sessionIndexTS) > 30*time.Second {
		rebuildSessionIndexLocked()
	}
	path, ok := sessionIndex[id]
	if !ok {
		// try case-insensitive
		for k, v := range sessionIndex {
			if strings.EqualFold(k, id) {
				return v
			}
		}
	}
	return path
}

func rebuildSessionIndexLocked() {
	idx := make(map[string]string)
	root := sessionsRoot()
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		name := info.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".jsonl") {
			return nil
		}
		stem := strings.TrimSuffix(name, ".jsonl")
		stem = strings.TrimSuffix(stem, ".json")
		id := extractUUID(stem)
		if id != "" {
			idx[id] = path
		}
		return nil
	})
	sessionIndex = idx
	sessionIndexTS = time.Now()
	log.Printf("[sessions] index rebuilt: %d files under %s", len(idx), root)
	if len(idx) > 0 {
		for k, v := range idx {
			log.Printf("[sessions] sample %s -> %s", k, v)
			break
		}
	}
}

// parseSessionHeader extracts id, title (first real user msg) and cwd.
func parseSessionHeader(path string) (string, string, string) {
	stem := strings.TrimSuffix(filepath.Base(path), ".jsonl")
	id := extractUUID(stem)
	if id == "" {
		id = stem
	}

	f, err := os.Open(path)
	if err != nil {
		return id, stem, ""
	}
	defer f.Close()

	br := bufio.NewReader(f)
	cwd := ""
	for i := 0; i < 200; i++ {
		line, err := br.ReadString('\n')
		if line != "" {
			if cwd == "" {
				if c, ok := extractCWD(line); ok {
					cwd = c
				}
			}
			if title, ok := extractUserTitle(line); ok {
				return id, title, cwd
			}
		}
		if err != nil {
			break
		}
	}
	return id, stem, cwd
}

// HistoryItem is a single rendered chat message for the web view.
type HistoryItem struct {
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

// ReadHistory returns the conversation messages stored in a session jsonl.
func ReadHistory(id string) []HistoryItem {
	path := sessionFileByID(id)
	if path == "" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var items []HistoryItem
	br := bufio.NewReader(f)
	for {
		line, err := br.ReadString('\n')
		if line != "" {
			if role, text := extractMessage(line); role != "" && text != "" {
				items = append(items, HistoryItem{Role: role, Content: text})
			}
		}
		if err != nil {
			break
		}
	}
	return items
}

// extractCWD pulls cwd out of a session_meta line.
func extractCWD(line string) (string, bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return "", false
	}
	var rec struct {
		Type    string `json:"type"`
		Payload struct {
			CWD string `json:"cwd"`
		} `json:"payload"`
	}
	if err := json.Unmarshal([]byte(line), &rec); err != nil {
		return "", false
	}
	if rec.Type != "session_meta" || rec.Payload.CWD == "" {
		return "", false
	}
	return rec.Payload.CWD, true
}

// extractMessage returns role + text for response_item message lines.
// Filters out tool-call / tool-result entries that Codex stores with role:"user".
func extractMessage(line string) (string, string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return "", ""
	}
	var rec struct {
		Type    string `json:"type"`
		Payload struct {
			Type    string `json:"type"`
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"payload"`
	}
	if err := json.Unmarshal([]byte(line), &rec); err != nil {
		return "", ""
	}
	if rec.Type != "response_item" || rec.Payload.Type != "message" {
		return "", ""
	}
	var parts []string
	for _, c := range rec.Payload.Content {
		t := strings.TrimSpace(c.Text)
		if t == "" {
			continue
		}
		// skip system-injected wrappers
		if strings.HasPrefix(t, "<") {
			continue
		}
		if isInjectedInstructionText(t) {
			continue
		}
		// skip Codex tool-call / tool-result wrappers
		if strings.HasPrefix(t, "[external_agent_tool_call") ||
			strings.HasPrefix(t, "[external_agent_tool_result") {
			continue
		}
		parts = append(parts, t)
	}
	if len(parts) == 0 {
		return "", ""
	}
	return rec.Payload.Role, strings.Join(parts, "\n")
}

// extractUserTitle returns the first real user message (for sidebar title).
func extractUserTitle(line string) (string, bool) {
	role, text := extractMessage(line)
	if role != "user" || text == "" {
		return "", false
	}
	return truncate(text, 80), true
}

func shouldReplaceSessionTitle(title, id string) bool {
	title = strings.TrimSpace(title)
	return title == "" || title == id || isInjectedInstructionText(title)
}

func isInjectedInstructionText(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	head := text
	if len(head) > 512 {
		head = head[:512]
	}
	return strings.HasPrefix(head, "AGENTS.md instructions") ||
		strings.Contains(head, "<INSTRUCTIONS>")
}

func extractUUID(s string) string {
	if len(s) < 36 {
		return ""
	}
	tail := s[len(s)-36:]
	if isUUID(tail) {
		return tail
	}
	return ""
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
				return false
			}
		}
	}
	return true
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	if n <= 3 {
		return s[:n]
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "..."
}
