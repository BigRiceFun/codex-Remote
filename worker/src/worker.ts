import { CodexRoom } from "./codex-room";

export { CodexRoom };

interface Env {
  CODEX_ROOM: DurableObjectNamespace;
  AGENT_TOKEN: string;   // set via `wrangler secret put AGENT_TOKEN`
  BROWSER_KEY?: string;  // optional simple key for browser
}

const HTML_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Codex Remote</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background:#0b0d12; color:#e6e6e6; height:100vh; display:flex; flex-direction:column; }
  header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#11141b; border-bottom:1px solid #1f2533; }
  header h1 { font-size:14px; margin:0; font-weight:600; letter-spacing:0.5px; }
  .status { font-size:12px; color:#9aa4b2; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .dot.online { background:#37d67a; }
  .dot.offline { background:#555; }
  .dot.running { background:#ffb84d; }
  .main { flex:1; display:flex; min-height:0; }

  /* Sidebar */
  .sidebar { width:280px; border-right:1px solid #1f2533; overflow-y:auto; background:#0d1017; transition: margin-left .2s ease; }
  .sidebar.collapsed { margin-left:-280px; }
  .sidebar .item { padding:10px 12px; border-bottom:1px solid #161b26; cursor:pointer; display:flex; gap:10px; align-items:flex-start; }
  .sidebar .item:hover { background:#141925; }
  .sidebar .item.active { background:#1a2030; border-left:2px solid #3766d6; padding-left:10px; }
  .sidebar .item .tick { width:8px; height:8px; border-radius:50%; background:#3a4253; flex:0 0 8px; margin-top:6px; }
  .sidebar .item.running .tick { background:#ffb84d; box-shadow:0 0 8px #ffb84d80; }
  .sidebar .item .body { flex:1; min-width:0; }
  .sidebar .item .title { font-size:13px; color:#d8dde6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sidebar .item .path { font-size:11px; color:#5b6477; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .sidebar .item.active .title { color:#fff; }

  /* Chat */
  .chat { flex:1; display:flex; flex-direction:column; min-width:0; }
  .chat-header { padding:8px 16px; border-bottom:1px solid #1f2533; font-size:12px; color:#8a94a6; background:#0d1017; }
  .chat-header .cwd { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:#5b6477; }
  .messages { flex:1; overflow-y:auto; padding:18px 16px; display:flex; flex-direction:column; gap:10px; }

  /* Bubbles */
  .row { display:flex; width:100%; }
  .row.user { justify-content:flex-end; }
  .row.agent { justify-content:flex-start; }
  .bubble { max-width:78%; padding:9px 13px; border-radius:12px; font-size:13px; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
  .bubble.user { background:#2563eb; color:#fff; border-bottom-right-radius:4px; }
  .bubble.agent { background:#1a2030; color:#e6e6e6; border:1px solid #232a3a; border-bottom-left-radius:4px; }
  .bubble.system { background:transparent; color:#6b7587; font-style:italic; font-size:12px; align-self:center; padding:2px 0; max-width:none; }
  .bubble.error { background:#3a1414; color:#ff8e8e; border:1px solid #5a1f1f; }
  .bubble.thinking { font-style:italic; color:#9aa4b2; }
  .bubble.thinking .dots i { display:inline-block; width:5px; height:5px; margin:0 1px; background:#9aa4b2; border-radius:50%; animation: blink 1.2s infinite ease-in-out both; }
  .bubble.thinking .dots i:nth-child(2) { animation-delay: 0.2s; }
  .bubble.thinking .dots i:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }

  .queue { font-size:12px; color:#ffb84d; padding:6px 16px; background:#1a1410; border-top:1px solid #2a2018; }
  .inputbar { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #1f2533; background:#0d1017; }
  .inputbar textarea { flex:1; resize:none; height:56px; background:#11141b; color:#e6e6e6; border:1px solid #232a3a; border-radius:10px; padding:10px 12px; font-size:13px; font-family:inherit; outline:none; }
  .inputbar textarea:focus { border-color:#3766d6; }
  .inputbar button { background:#3766d6; color:#fff; border:0; border-radius:10px; padding:0 22px; cursor:pointer; font-size:13px; font-weight:500; }
  .inputbar button:hover:not(:disabled) { background:#2f57b8; }
  .inputbar button:disabled { background:#2a3550; color:#8893a8; cursor:not-allowed; }
  .empty { color:#5b6477; padding:40px; text-align:center; font-size:13px; }

  /* Slim scrollbars */
  *::-webkit-scrollbar { width:6px; height:6px; }
  *::-webkit-scrollbar-track { background:transparent; }
  *::-webkit-scrollbar-thumb { background:#2a3142; border-radius:3px; }
  *::-webkit-scrollbar-thumb:hover { background:#3a4253; }
  * { scrollbar-width:thin; scrollbar-color:#2a3142 transparent; }

  /* Sidebar toggle button */
  .iconbtn { background:transparent; border:1px solid #232836; color:#9aa4b2; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:14px; line-height:1; }
  .iconbtn:hover { background:#171c26; color:#e6e6e6; }

  /* Mobile sidebar backdrop */
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:none; z-index:40; }
  .backdrop.visible { display:block; }

  /* Mobile defaults: hide sidebar by default, show as overlay */
  @media (max-width: 720px) {
    .sidebar { position:fixed; top:0; bottom:0; left:0; z-index:50; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
    .sidebar.collapsed { margin-left:-280px; }
    header h1 { display:none; }
    .status { font-size:10px; }
    header { padding:8px 10px; }
    .messages { padding:12px 10px; }
    .bubble { max-width:88%; font-size:13px; }
    .inputbar { padding:8px; }
    .chat-header { padding:6px 10px; font-size:11px; }
  }
  @media (min-width: 721px) {
    /* On desktop, no backdrop ever needed */
    .backdrop { display:none !important; }
  }

  #debug { position:fixed; right:8px; top:48px; font-size:10px; color:#9aa4b2; background:#0a0c10; border:1px solid #232836; padding:4px 8px; border-radius:4px; max-width:50vw; max-height:40vh; overflow:auto; pointer-events:auto; display:none; }
  #debugToggle { position:fixed; right:8px; bottom:72px; font-size:10px; color:#9aa4b2; background:#0a0c10; border:1px solid #232836; padding:2px 8px; border-radius:4px; cursor:pointer; z-index:100; }
  #debug.visible { display:block; }
</style>
</head>
<body>
<header>
  <div style="display:flex; align-items:center; gap:10px;">
    <button id="toggleSidebar" class="iconbtn" aria-label="toggle sidebar">☰</button>
    <h1>◆ Codex Remote</h1>
  </div>
  <div class="status">
    <span id="agentDot" class="dot offline"></span>
    <span id="agentState">agent offline</span>
    &nbsp;|&nbsp;
    <span id="runDot" class="dot"></span>
    <span id="runState">idle</span>
    &nbsp;|&nbsp;
    <span id="ownerState"></span>
  </div>
</header>
<div class="main">
  <div class="sidebar" id="sidebar"><div class="empty">未连接 agent</div></div>
  <div class="backdrop" id="backdrop"></div>
  <div class="chat">
    <div class="chat-header" id="chatHeader"><span class="cwd">选择一个会话</span></div>
    <div class="messages" id="messages"><div class="empty">选择左侧会话开始</div></div>
    <div class="queue" id="queue" style="display:none"></div>
    <div class="inputbar">
      <textarea id="input" placeholder="输入消息... (Enter 发送 / Shift+Enter 换行)"></textarea>
      <button id="sendBtn" disabled>发送</button>
    </div>
  </div>
</div>
<div id="debug"></div>
<div id="debugToggle">🔧 log</div>
<script>
const KEY = new URLSearchParams(location.search).get('key') || localStorage.getItem('codex_key') || '';
if (KEY) localStorage.setItem('codex_key', KEY);

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = proto + '://' + location.host + '/ws/client' + (KEY ? '?key=' + encodeURIComponent(KEY) : '');
let ws = null;
let currentSession = null;
let sessions = [];
let connected = false;

const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const messages = $('messages');
const inputEl = $('input');
const sendBtn = $('sendBtn');
const debugEl = $('debug');
const debugLog = [];
function dbg(line) {
  const t = new Date().toLocaleTimeString();
  debugLog.unshift('[' + t + '] ' + line);
  if (debugLog.length > 30) debugLog.length = 30;
  debugEl.innerHTML = debugLog.map(s => '<div>' + escapeHtml(s) + '</div>').join('');
}
dbg('page loaded');
document.getElementById('debugToggle').onclick = () => {
  debugEl.classList.toggle('visible');
};

// Sidebar toggle (mobile-friendly)
const sidebarEl = $('sidebar');
const backdropEl = $('backdrop');
function sidebarOpen() {
  sidebarEl.classList.remove('collapsed');
  if (window.matchMedia('(max-width: 720px)').matches) backdropEl.classList.add('visible');
}
function sidebarClose() {
  sidebarEl.classList.add('collapsed');
  backdropEl.classList.remove('visible');
}
function sidebarToggle() {
  if (sidebarEl.classList.contains('collapsed')) sidebarOpen();
  else sidebarClose();
}
(function initSidebar() {
  if (window.matchMedia('(max-width: 720px)').matches) sidebarClose();
})();
$('toggleSidebar').onclick = sidebarToggle;
backdropEl.onclick = sidebarClose;

function setAgentOnline(v) {
  connected = v;
  $('agentDot').className = 'dot ' + (v ? 'online' : 'offline');
  $('agentState').textContent = v ? 'agent online' : 'agent offline';
  sendBtn.disabled = !(v && currentSession);
}
setAgentOnline(false);

function setStatus(s) {
  // s: { running, current, owner, queue }
  $('runDot').className = 'dot ' + (s.running ? 'running' : '');
  $('runState').textContent = s.running ? ('running' + (s.current ? ': ' + s.current : '')) : 'idle';
  $('ownerState').textContent = s.owner ? ('owner: ' + s.owner) : '';
  const q = $('queue');
  if (s.queue && s.queue.length) {
    q.style.display = 'block';
    q.textContent = 'queued (' + s.queue.length + '): ' + s.queue.slice(0,3).join(' / ') + (s.queue.length > 3 ? ' ...' : '');
  } else { q.style.display = 'none'; }
  // refresh sidebar running indicator
  document.querySelectorAll('.sidebar .item').forEach(el => {
    el.classList.toggle('running', el.dataset.id === s.current && s.running);
  });
}

function renderSidebar(list) {
  sessions = list || [];
  if (!sessions.length) { sidebar.innerHTML = '<div class="empty">暂无会话</div>'; return; }
  sidebar.innerHTML = sessions.map(s => {
    const title = escapeHtml(s.title || s.id);
    const cwd = s.cwd ? escapeHtml(shortenPath(s.cwd)) : '';
    return '<div class="item' + (s.id === currentSession ? ' active' : '') + '" data-id="' + s.id + '">' +
      '<span class="tick"></span>' +
      '<div class="body"><div class="title">' + title + '</div>' +
      (cwd ? '<div class="path">' + cwd + '</div>' : '') + '</div>' +
    '</div>';
  }).join('');
  sidebar.querySelectorAll('.item').forEach(el => {
    el.onclick = () => selectSession(el.dataset.id);
  });
}

function shortenPath(p) {
  // Show last 2-3 segments for readability
  const sep = p.includes('\\\\') ? '\\\\' : (p.includes('/') ? '/' : '\\\\');
  const parts = p.split(/[\\\\/]/).filter(Boolean);
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

function setChatHeader(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) { $('chatHeader').innerHTML = '<span class="cwd">选择一个会话</span>'; return; }
  const title = escapeHtml(s.title || s.id);
  const cwd = s.cwd ? escapeHtml(s.cwd) : '';
  $('chatHeader').innerHTML = '<div>' + title + '</div>' + (cwd ? '<div class="cwd">' + cwd + '</div>' : '');
}

function isNoise(text) {
  if (!text) return false;
  const t = text.trim();
  if (!t) return true;
  // codex exec startup banner
  if (/^OpenAI Codex v/.test(t)) return true;
  if (/^-+$/.test(t)) return true;
  if (/^workdir:/i.test(t)) return true;
  if (/^model:/i.test(t)) return true;
  if (/^provider:/i.test(t)) return true;
  if (/^approval:/i.test(t)) return true;
  if (/^reasoning effort:/i.test(t)) return true;
  if (/^reasoning summaries:/i.test(t)) return true;
  if (/^session id:/i.test(t)) return true;
  if (/^: - \\[/.test(t)) return true;
  if (/^tokens used/.test(t)) return true;
  // bare role markers that slip through
  if (t === 'user' || t === 'codex' || t === 'assistant') return true;
  // internal codex logs
  if (/^\\d{4}-\\d{2}-\\d{2}T.*ERROR/.test(t)) return true;
  if (/failed to record rollout items/.test(t)) return true;
  // bare token-count number like "1,714,659"
  if (/^[\\d,]+$/.test(t) && t.length <= 12) return true;
  // reasoning commentary leaked into stdout
  if (/^The user is just testing/.test(t)) return true;
  if (/^I'll keep it brief/.test(t)) return true;
  return false;
}

function selectSession(id) {
  currentSession = id;
  messages.innerHTML = '';
  sendBtn.disabled = !connected;
  setChatHeader(id);
  document.querySelectorAll('.sidebar .item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  send({ type: 'select', session: id });
  // On mobile, close the sidebar after picking a session.
  if (window.matchMedia('(max-width: 720px)').matches) sidebarClose();
}

function appendMessage(kind, text) {
  if (isNoise(text)) return;
  // Dedup adjacent identical bubbles (codex exec sometimes prints the answer twice).
  const lastRow = messages.lastElementChild;
  if (lastRow && lastRow.classList.contains('row') && lastRow.classList.contains(kind)) {
    const lastBubble = lastRow.querySelector('.bubble');
    if (lastBubble && lastBubble.textContent === text) return;
  }
  const row = document.createElement('div');
  row.className = 'row ' + kind;
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + kind;
  bubble.textContent = text;
  row.appendChild(bubble);
  if (messages.firstChild && messages.firstChild.className === 'empty') messages.innerHTML = '';
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

let thinkingEl = null;
function showThinking() {
  clearThinking();
  const row = document.createElement('div');
  row.className = 'row agent';
  const b = document.createElement('div');
  b.className = 'bubble agent thinking';
  b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Codex 正在思考…';
  row.appendChild(b);
  thinkingEl = row;
  if (messages.firstChild && messages.firstChild.className === 'empty') messages.innerHTML = '';
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}
function clearThinking() {
  if (thinkingEl && thinkingEl.parentNode) {
    thinkingEl.parentNode.removeChild(thinkingEl);
  }
  thinkingEl = null;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  dbg('connecting ' + wsUrl);
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { dbg('ws open'); setAgentOnline(false); send({ type: 'hello' }); };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { dbg('bad msg: ' + ev.data.slice(0,120)); return; }
    dbg('recv ' + m.type + (m.online !== undefined ? ' online=' + m.online : '') + (m.sessions ? ' sessions=' + m.sessions.length : '') + (m.content ? ' content="' + m.content.slice(0,40) + '"' : ''));
    switch (m.type) {
      case 'hello':
      case 'agent_status':
        setAgentOnline(!!m.online);
        if (m.sessions) renderSidebar(m.sessions);
        if (m.status) setStatus(m.status);
        break;
      case 'sessions':
        renderSidebar(m.sessions);
        break;
      case 'status':
        setStatus(m.status);
        break;
      case 'stream':
        if (m.session === currentSession) {
          clearThinking();
          appendMessage('agent', m.content);
        }
        break;
      case 'user':
        if (m.session === currentSession) appendMessage('user', m.content);
        break;
      case 'agent':
        if (m.session === currentSession) appendMessage('agent', m.content);
        break;
      case 'input_echo':
        if (m.session === currentSession) appendMessage('user', m.content);
        break;
      case 'system':
        if (m.session === currentSession || !m.session) {
          if (m.content === 'codex started') showThinking();
          else if (m.content === 'codex exited' || /exited/.test(m.content)) clearThinking();
          appendMessage('system', m.content);
        }
        break;
      case 'error':
        appendMessage('error', '[error] ' + (m.content || ''));
        break;
    }
  };
  ws.onclose = (e) => { dbg('ws close code=' + e.code + ' reason=' + e.reason); setAgentOnline(false); setTimeout(connect, 2000); };
  ws.onerror = (e) => { dbg('ws error'); try { ws.close(); } catch {} };
}

sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text || !currentSession) return;
  send({ type: 'send', session: currentSession, text });
  inputEl.value = '';
};
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

connect();
</script>
</body>
</html>`;

function json(data: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function checkBrowserKey(request: Request, env: Env): boolean {
  if (!env.BROWSER_KEY) return true; // no key configured = open (use Cloudflare Access in prod)
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-codex-key") || "";
  return key === env.BROWSER_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Frontend ----------------------------------------------------------
    if (path === "/" || path === "/index.html") {
      return new Response(HTML_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // --- WebSocket: browser & agent ---------------------------------------
    if (path === "/ws/client") {
      if (!checkBrowserKey(request, env)) return json({ error: "bad key" }, 401);
      const id = env.CODEX_ROOM.idFromName("default");
      const stub = env.CODEX_ROOM.get(id);
      // Switch protocol to WebSocket inside the DO
      return stub.fetch(new Request("http://internal/ws/client", request));
    }
    if (path === "/ws/agent") {
      const token = url.searchParams.get("token") || request.headers.get("x-codex-token") || "";
      if (!env.AGENT_TOKEN || token !== env.AGENT_TOKEN) {
        return json({ error: "bad agent token" }, 401);
      }
      const id = env.CODEX_ROOM.idFromName("default");
      const stub = env.CODEX_ROOM.get(id);
      return stub.fetch(new Request("http://internal/ws/agent", request));
    }

    // --- REST API ---------------------------------------------------------
    if (path.startsWith("/api/")) {
      if (!checkBrowserKey(request, env)) return json({ error: "bad key" }, 401);
      const id = env.CODEX_ROOM.idFromName("default");
      const stub = env.CODEX_ROOM.get(id);

      if (path === "/api/sessions" && request.method === "GET") {
        return stub.fetch("http://internal/api/sessions");
      }
      if (path === "/api/status" && request.method === "GET") {
        return stub.fetch("http://internal/api/status");
      }
      if (path === "/api/send" && request.method === "POST") {
        return stub.fetch(new Request("http://internal/api/send", { method: "POST", body: await request.text() }));
      }
      return json({ error: "not found" }, 404);
    }

    return new Response("Not Found", { status: 404 });
  },
};
