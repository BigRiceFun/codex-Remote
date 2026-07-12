package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// Agent holds the websocket connection to the Worker and owns the engine.
type Agent struct {
	ctx     context.Context
	cancel  context.CancelFunc
	connMu  sync.RWMutex
	writeMu sync.Mutex
	conn    *websocket.Conn
	worker  string
	token   string

	engine *Engine

	sessionsMu       sync.Mutex
	lastSessionsList []Session
	lastSessionsJSON string
}

func main() {
	var (
		workerURL = flag.String("worker", envOr("CODEX_WORKER", "ws://localhost:8787/ws/agent"), "worker ws url (path /ws/agent)")
		token     = flag.String("token", envOr("CODEX_AGENT_TOKEN", ""), "agent token (must match Worker secret AGENT_TOKEN)")
		agentID   = flag.String("id", envOr("CODEX_AGENT_ID", "windows-pc"), "agent identifier (informational)")
	)
	flag.Parse()
	_ = agentID

	if *token == "" {
		if b, err := os.ReadFile(filepath.Join(codexDir(), "remote-token")); err == nil {
			*token = strings.TrimSpace(string(b))
		}
	}
	if *token == "" {
		log.Fatal("token required: pass -token CODEX_AGENT_TOKEN or set CODEX_AGENT_TOKEN")
	}

	ctx, cancel := context.WithCancel(context.Background())
	a := &Agent{
		ctx:    ctx,
		cancel: cancel,
		worker: *workerURL,
		token:  *token,
	}
	a.engine = NewEngine(a)

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		cancel()
	}()

	go a.engine.OwnerTimeoutLoop()
	go a.engine.SessionFileTailLoop()
	go a.sessionRefresher()
	a.publishSessions()

	a.run()
}

func (a *Agent) run() {
	backoff := time.Second
	for {
		if a.ctx.Err() != nil {
			return
		}
		err := a.connectAndServe()
		if err != nil {
			log.Printf("[agent] disconnected: %v", err)
		}
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (a *Agent) connectAndServe() error {
	u, err := url.Parse(a.worker)
	if err != nil {
		return err
	}
	hdr := http.Header{}
	hdr.Set("User-Agent", "codex-remote-agent")
	hdr.Set("X-Codex-Token", a.token)

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		NetDialContext:   proxyDialContext,
	}
	c, _, err := dialer.DialContext(a.ctx, u.String(), hdr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	a.connMu.Lock()
	a.conn = c
	a.connMu.Unlock()
	log.Printf("[agent] connected to %s://%s%s", u.Scheme, u.Host, u.Path)
	defer func() {
		a.connMu.Lock()
		if a.conn == c {
			a.conn = nil
		}
		a.connMu.Unlock()
		_ = c.Close()
	}()

	// Immediately push full state so a freshly-opened browser sees sessions right away.
	a.publishSessions()
	a.publishStatus()
	a.engine.publishPendingApproval()

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return err
		}
		a.engine.HandleIncoming(data)
	}
}

func (a *Agent) emit(m AgentOutgoing) {
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	a.connMu.RLock()
	conn := a.conn
	a.connMu.RUnlock()
	if conn == nil {
		return
	}
	data, err := json.Marshal(m)
	if err != nil {
		return
	}
	_ = conn.WriteMessage(websocket.TextMessage, data)
}

func (a *Agent) logf(format string, args ...any) {
	log.Printf("[agent] "+format, args...)
}

func (a *Agent) publishSessions() {
	list := ListSessions()
	// Only emit when the list actually changes, to avoid flooding the log.
	a.sessionsMu.Lock()
	if a.lastSessionsJSON != "" {
		if equalSessions(a.lastSessionsList, list) {
			a.sessionsMu.Unlock()
			return
		}
	}
	a.lastSessionsList = list
	a.sessionsMu.Unlock()
	a.emit(AgentOutgoing{Type: "sessions", Sessions: list})
}

func (a *Agent) snapshotSessions() []Session {
	a.sessionsMu.Lock()
	defer a.sessionsMu.Unlock()
	out := make([]Session, len(a.lastSessionsList))
	copy(out, a.lastSessionsList)
	return out
}

func equalSessions(a, b []Session) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID || a[i].Title != b[i].Title || a[i].CWD != b[i].CWD || a[i].Time != b[i].Time {
			return false
		}
	}
	return true
}

func (a *Agent) publishStatus() {
	if a.engine == nil {
		return
	}
	a.emit(AgentOutgoing{Type: "status", Status: a.engine.Snapshot()})
}

func (a *Agent) sessionRefresher() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-t.C:
			a.publishSessions()
		}
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// proxyDialContext respects HTTP_PROXY / HTTPS_PROXY env vars so the agent can
// reach workers.dev through a local Clash/V2Ray when direct IPv4 is blocked.
func proxyDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	httpsProxy := os.Getenv("HTTPS_PROXY")
	if httpsProxy == "" {
		httpsProxy = os.Getenv("https_proxy")
	}
	if httpsProxy == "" && strings.EqualFold(host, "127.0.0.1") {
		// never proxy localhost
		var d net.Dialer
		return d.DialContext(ctx, network, addr)
	}
	if httpsProxy == "" {
		var d net.Dialer
		return d.DialContext(ctx, network, addr)
	}
	// only support http:// proxies (typical Clash/Mihomo/V2Ray HTTP inbound)
	if !strings.HasPrefix(httpsProxy, "http://") && !strings.HasPrefix(httpsProxy, "https://") {
		// treat as host:port
		httpsProxy = "http://" + httpsProxy
	}
	pu, err := url.Parse(httpsProxy)
	if err != nil {
		return nil, err
	}
	paddr := pu.Host
	if pu.Port() == "" {
		paddr = pu.Hostname() + ":8080"
	}
	var d net.Dialer
	pc, err := d.DialContext(ctx, "tcp", paddr)
	if err != nil {
		return nil, err
	}
	// CONNECT for HTTPS (WSS is HTTPS). port 443 typical
	connectReq := fmt.Sprintf("CONNECT %s:%s HTTP/1.1\r\nHost: %s:%s\r\n\r\n", host, port, host, port)
	if _, err := pc.Write([]byte(connectReq)); err != nil {
		pc.Close()
		return nil, err
	}
	buf := make([]byte, 1024)
	n, err := pc.Read(buf)
	if err != nil {
		pc.Close()
		return nil, err
	}
	if !strings.Contains(string(buf[:n]), " 200 ") {
		pc.Close()
		return nil, fmt.Errorf("proxy CONNECT failed: %s", strings.SplitN(string(buf[:n]), "\r\n", 2)[0])
	}
	return pc, nil
}
