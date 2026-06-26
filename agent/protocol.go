package main

// AgentOutgoing are messages agent -> worker.
type AgentOutgoing struct {
	Type     string         `json:"type"`
	Sessions []Session      `json:"sessions,omitempty"`
	Status   *StatusPayload `json:"status,omitempty"`
	Session  string         `json:"session,omitempty"`
	Content  string         `json:"content,omitempty"`
}

// StatusPayload is mirrored into the browser header.
type StatusPayload struct {
	Running bool     `json:"running"`
	Current *string  `json:"current"`
	Owner   *string  `json:"owner"`
	Queue   []string `json:"queue"`
}

// WorkerIncoming are messages worker -> agent.
type WorkerIncoming struct {
	Type    string `json:"type"`
	Session string `json:"session"`
	Text    string `json:"text"`
}
