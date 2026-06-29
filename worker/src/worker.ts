import { CodexRoom } from "./codex-room";

export { CodexRoom };

interface Env {
  CODEX_ROOM: DurableObjectNamespace;
  AGENT_TOKEN: string;   // set via `wrangler secret put AGENT_TOKEN`
  BROWSER_KEY?: string;  // optional simple key for browser
}

const HTML_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Codex Remote</title>
<style>
  :root {
    --bg: #0f1115;
    --sidebar: #14161b;
    --card: #181b20;
    --hover: #20242b;
    --border: #2a2f38;
    --text: #ffffff;
    --text-secondary: #9ca3af;
    --muted: #6b7280;
    --accent: #3b82f6;
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
    --radius: 10px;
    --transition: 180ms ease-out;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  button, input, textarea {
    font: inherit;
    color: inherit;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid rgba(59, 130, 246, .9);
    outline-offset: 1px;
  }
  a {
    color: var(--accent);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    --sidebar-width: 280px;
    --info-width: 300px;
  }
  .app-header {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .header-left,
  .header-right,
  .header-status {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .header-left {
    flex: 1 1 320px;
  }
  .header-status {
    flex: 0 1 auto;
  }
  .header-right {
    flex: 1 0 auto;
    justify-content: flex-end;
  }
  .mobile-only {
    display: none;
  }
  .header-title-wrap {
    min-width: 0;
  }
  .header-eyebrow {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-pill {
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-secondary);
    background: transparent;
    white-space: nowrap;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--muted);
    flex: 0 0 8px;
  }
  .status-dot.online { background: var(--success); }
  .status-dot.running { background: var(--warning); }
  .app-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--info-width);
  }
  .sidebar-shell {
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    transition: width var(--transition), border-color var(--transition);
  }
  .app.sidebar-collapsed {
    --sidebar-width: 0px;
  }
  .app.sidebar-collapsed .sidebar-shell {
    border-right-color: transparent;
    pointer-events: none;
  }
  .app.info-collapsed {
    --info-width: 0px;
  }
  .app.info-collapsed .info-panel {
    border-left-color: transparent;
    padding-left: 0;
    padding-right: 0;
    pointer-events: none;
  }
  .sidebar-top {
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-top-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    color: var(--muted);
    font-size: 12px;
  }
  .sidebar-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .sidebar-title {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .search {
    position: relative;
  }
  .search svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    pointer-events: none;
  }
  .search input {
    width: 100%;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    padding: 0 12px 0 36px;
    outline: none;
    transition: border-color var(--transition), background var(--transition);
  }
  .search input:focus {
    border-color: var(--accent);
  }
  .search input::placeholder {
    color: var(--muted);
  }
  .sidebar-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px 10px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .sidebar-section-label {
    padding: 0 8px 8px;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .sidebar-section {
    min-width: 0;
  }
  .sidebar-section + .sidebar-section {
    margin-top: 2px;
  }
  .sidebar-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 8px 8px;
  }
  .sidebar-section-note {
    color: var(--muted);
    font-size: 12px;
  }
  .sidebar-card {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #121419;
    overflow: hidden;
  }
  .sidebar-card + .sidebar-card {
    margin-top: 8px;
  }
  .sidebar-group {
    margin-bottom: 10px;
  }
  .group-toggle {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 10px 8px;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: background var(--transition);
  }
  .group-toggle:hover {
    background: var(--hover);
  }
  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .group-count {
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
  }
  .group-caret {
    width: 14px;
    color: var(--muted);
    transition: transform var(--transition);
  }
  .sidebar-group.collapsed .group-caret {
    transform: rotate(-90deg);
  }
  .group-path {
    margin-top: 4px;
    padding-left: 22px;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .group-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .sidebar-group.collapsed .group-items {
    display: none;
  }
  .conversation-item {
    margin: 0 0 0 14px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    transition: background var(--transition), border-color var(--transition);
  }
  .conversation-item:hover {
    background: var(--hover);
    border-color: var(--border);
  }
  .conversation-item.active {
    background: #1a1e25;
    border-color: #313743;
  }
  .conversation-badge {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 18px;
    margin-top: 1px;
    background: #121419;
    color: var(--muted);
  }
  .conversation-item.running .conversation-badge {
    color: var(--warning);
    border-color: rgba(245, 158, 11, .35);
  }
  .conversation-copy {
    min-width: 0;
    flex: 1;
  }
  .conversation-title {
    color: var(--text);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .conversation-meta {
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .main-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .conversation-head {
    padding: 18px 24px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .conversation-head-main {
    min-width: 0;
  }
  .conversation-head-title {
    font-size: 20px;
    line-height: 1.2;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .conversation-head-path {
    margin-top: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .conversation-head-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .messages-panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .messages {
    height: 100%;
    overflow: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .row {
    display: flex;
    width: 100%;
  }
  .row.user {
    justify-content: flex-end;
  }
  .row.agent,
  .row.system,
  .row.error {
    justify-content: flex-start;
  }
  .message-shell {
    max-width: min(920px, 88%);
  }
  .row.user .message-shell {
    max-width: min(760px, 82%);
  }
  .message-meta {
    margin-bottom: 6px;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row.user .message-meta {
    justify-content: flex-end;
  }
  .bubble {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    background: var(--card);
    color: var(--text);
    line-height: 1.65;
    word-break: break-word;
  }
  .bubble.user {
    background: #15191f;
    border-color: #2f3742;
  }
  .bubble.system {
    background: transparent;
    border-style: dashed;
    color: var(--text-secondary);
  }
  .bubble.error {
    border-color: rgba(239, 68, 68, .35);
    color: #fca5a5;
    background: rgba(127, 29, 29, .12);
  }
  .bubble.thinking {
    color: var(--text-secondary);
  }
  .bubble.thinking .dots i {
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 4px;
    border-radius: 999px;
    background: currentColor;
    animation: blink 1.2s infinite ease-out both;
  }
  .bubble.thinking .dots i:nth-child(2) { animation-delay: .2s; }
  .bubble.thinking .dots i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink {
    0%, 80%, 100% { opacity: .2; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-1px); }
  }
  .markdown > *:first-child { margin-top: 0; }
  .markdown > *:last-child { margin-bottom: 0; }
  .markdown p,
  .markdown ul,
  .markdown ol,
  .markdown blockquote,
  .markdown table,
  .markdown pre {
    margin: 0 0 12px;
  }
  .markdown h1,
  .markdown h2,
  .markdown h3 {
    margin: 0 0 10px;
    line-height: 1.3;
    font-weight: 600;
  }
  .markdown h1 { font-size: 20px; }
  .markdown h2 { font-size: 16px; }
  .markdown h3 { font-size: 14px; }
  .markdown ul,
  .markdown ol {
    padding-left: 22px;
  }
  .markdown li + li {
    margin-top: 4px;
  }
  .markdown blockquote {
    border-left: 2px solid var(--border);
    padding-left: 12px;
    color: var(--text-secondary);
  }
  .markdown table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .markdown th,
  .markdown td {
    border: 1px solid var(--border);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }
  .markdown th {
    color: var(--text-secondary);
    background: #121419;
    font-weight: 600;
  }
  .inline-code {
    display: inline-block;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #121419;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .92em;
  }
  .math-inline,
  .math-block {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: .01em;
  }
  .math-inline {
    display: inline-block;
    padding: 0 4px;
    border-radius: 5px;
    background: rgba(18, 20, 25, .85);
    border: 1px solid var(--border);
  }
  .math-block {
    display: block;
    margin: 8px 0 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #111317;
    overflow-x: auto;
  }
  .code-block {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #111317;
  }
  .code-head {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12px;
    background: #15181d;
  }
  .code-head strong {
    font-weight: 600;
    color: var(--text);
  }
  .code-copy {
    height: 28px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background var(--transition), color var(--transition), border-color var(--transition);
  }
  .code-copy:hover {
    background: var(--hover);
    color: var(--text);
  }
  .code-copy.copied {
    color: var(--success);
    border-color: rgba(34, 197, 94, .35);
  }
  .code-block pre {
    margin: 0;
    padding: 14px 16px 16px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    color: #d7dde8;
  }
  .composer-wrap {
    padding: 0 24px 24px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .queue {
    margin: 12px 0 0;
    padding: 10px 12px;
    border: 1px solid rgba(245, 158, 11, .25);
    border-radius: 10px;
    background: rgba(245, 158, 11, .08);
    color: #fbbf24;
    font-size: 12px;
  }
  .composer {
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    overflow: hidden;
  }
  .composer textarea {
    width: 100%;
    min-height: 88px;
    max-height: 260px;
    resize: none;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    padding: 16px;
    line-height: 1.6;
  }
  .composer textarea::placeholder {
    color: var(--muted);
  }
  .composer-footer {
    height: 48px;
    padding: 0 12px 12px 16px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .composer-hint {
    color: var(--muted);
    font-size: 12px;
  }
  .btn {
    height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: background var(--transition), color var(--transition), border-color var(--transition);
  }
  .btn:hover {
    background: var(--hover);
    color: var(--text);
  }
  .btn:disabled {
    opacity: .45;
    cursor: not-allowed;
    background: transparent;
  }
  .btn-primary {
    background: #1f232a;
    color: var(--text);
    border-color: #313743;
  }
  .btn-primary:hover:not(:disabled) {
    background: #252a33;
    border-color: #3b434f;
    color: var(--text);
  }
  .iconbtn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background var(--transition), color var(--transition), border-color var(--transition);
  }
  .iconbtn:hover {
    background: var(--hover);
    color: var(--text);
  }
  .info-panel {
    position: relative;
    background: var(--bg);
    border-left: 1px solid var(--border);
    padding: 24px;
    overflow: auto;
    min-width: 0;
    width: 100%;
    transition: border-color var(--transition), padding var(--transition);
  }
  .app.info-collapsed .info-panel > * {
    display: none;
  }
  .panel-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    padding: 16px;
  }
  .panel-card + .panel-card {
    margin-top: 16px;
  }
  .panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 14px;
  }
  .panel-grid {
    display: grid;
    gap: 10px;
  }
  .panel-row {
    display: grid;
    gap: 4px;
  }
  .panel-row-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .panel-row-value {
    color: var(--text-secondary);
    font-size: 13px;
    word-break: break-word;
  }
  .panel-row-value.code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .empty {
    min-height: 180px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    color: var(--muted);
    background: rgba(24, 27, 32, .35);
  }
  .backdrop {
    position: fixed;
    inset: 48px 0 0;
    background: rgba(0, 0, 0, .45);
    display: none;
    z-index: 40;
  }
  .backdrop.visible {
    display: block;
  }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: #232831; border-radius: 999px; }
  *::-webkit-scrollbar-thumb:hover { background: #323846; }
  * { scrollbar-width: thin; scrollbar-color: #232831 transparent; }
  #debug {
    position: fixed;
    right: 12px;
    bottom: 64px;
    z-index: 120;
    width: min(360px, calc(100vw - 24px));
    max-height: 40vh;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #111317;
    color: var(--text-secondary);
    font-size: 12px;
    display: none;
  }
  #debug.visible { display: block; }
  #debugToggle {
    position: fixed;
    right: 12px;
    bottom: 16px;
    z-index: 120;
    display: none;
  }
  #debugToggle.visible {
    display: inline-flex;
  }
  @media (max-width: 1180px) {
    .app-layout {
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    }
    .info-panel {
      position: fixed;
      top: 48px;
      right: 0;
      bottom: 0;
      width: min(92vw, 340px);
      z-index: 70;
      background: var(--bg);
      transform: translateX(100%);
      transition: transform var(--transition);
      border-left: 1px solid var(--border);
      box-shadow: none;
      display: block;
      padding-top: 52px;
    }
    .app.info-collapsed .info-panel {
      width: min(92vw, 340px);
      padding: 52px 24px 24px;
      pointer-events: none;
    }
    .app.info-collapsed .info-panel > * {
      display: block;
    }
    .info-panel.drawer-open {
      transform: translateX(0);
      pointer-events: auto;
    }
  }
  @media (max-width: 900px) {
    .app-header {
      padding: 0 12px;
    }
    .header-status {
      display: none;
    }
    .app-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .sidebar-shell {
      position: fixed;
      top: 48px;
      left: 0;
      bottom: 0;
      width: min(86vw, 292px);
      z-index: 60;
      box-shadow: none;
      transform: translateX(0);
      transition: transform var(--transition), border-color var(--transition);
    }
    .app.sidebar-collapsed .sidebar-shell,
    .sidebar-shell.collapsed {
      transform: translateX(calc(-100% - 1px));
      pointer-events: none;
      border-right-color: transparent;
    }
    .conversation-head,
    .messages,
    .composer-wrap {
      padding-left: 16px;
      padding-right: 16px;
    }
    .row .message-shell {
      max-width: 100%;
    }
  }
  @media (max-width: 640px) {
    .mobile-only {
      display: inline-flex;
    }
    .info-panel {
      width: min(94vw, 340px);
      padding: 48px 16px 16px;
    }
    .header-title {
      font-size: 14px;
    }
    .conversation-head-title {
      font-size: 16px;
    }
    .composer textarea {
      min-height: 76px;
    }
    .composer-footer {
      height: auto;
      flex-direction: column;
      align-items: stretch;
      padding-top: 0;
    }
    .composer-hint {
      order: 2;
    }
    .btn {
      width: 100%;
    }
  }
</style>
</head>
<body>
<div class="app">
<header class="app-header">
  <div class="header-left">
    <button id="toggleSidebar" class="iconbtn" aria-label="展开或收起侧边栏"></button>
    <div class="header-title-wrap">
      <div class="header-eyebrow">Codex Remote</div>
      <div id="headerTitle" class="header-title">选择一个会话</div>
    </div>
  </div>
  <div class="header-status">
    <div class="status-pill"><span id="agentDot" class="status-dot"></span><span id="agentState">Agent 离线</span></div>
    <div class="status-pill"><span id="runDot" class="status-dot"></span><span id="runState">空闲</span></div>
    <div id="ownerPill" class="status-pill" style="display:none"><span id="ownerState">占用者：web</span></div>
  </div>
  <div class="header-right"></div>
</header>
<div class="app-layout">
  <aside class="sidebar-shell" id="sidebarShell">
    <div class="sidebar-top">
      <div class="sidebar-title">会话</div>
      <div class="search">
        <svg id="searchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>
        <input id="searchInput" type="search" placeholder="搜索会话" autocomplete="off" />
      </div>
    </div>
    <div class="sidebar-body">
      <div class="sidebar-section-label">项目</div>
      <div id="sidebar"><div class="empty">Agent 离线</div></div>
    </div>
  </aside>
  <div class="backdrop" id="backdrop"></div>
  <main class="main-panel">
    <div class="conversation-head">
      <div class="conversation-head-main">
        <div id="chatTitle" class="conversation-head-title">选择一个会话</div>
        <div id="chatPath" class="conversation-head-path">连接 Agent 后查看会话历史</div>
      </div>
      <div class="conversation-head-tools">
        <button id="toggleInfo" class="iconbtn" aria-label="展开或收起信息面板"></button>
      </div>
    </div>
    <div class="messages-panel">
      <div class="messages" id="messages"><div class="empty">选择一个会话开始</div></div>
    </div>
    <div class="composer-wrap">
      <div class="queue" id="queue" style="display:none"></div>
      <div class="composer">
        <textarea id="input" placeholder="输入消息..."></textarea>
        <div class="composer-footer">
          <div class="composer-hint">Enter 发送 / Shift+Enter 换行</div>
          <button id="sendBtn" class="btn btn-primary" disabled>发送</button>
        </div>
      </div>
    </div>
  </main>
  <aside class="info-panel" id="infoPanel">
    <div class="panel-card">
      <div class="panel-title">会话</div>
      <div class="panel-grid">
        <div class="panel-row">
          <div class="panel-row-label">标题</div>
          <div id="panelSessionTitle" class="panel-row-value">未选择会话</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">会话 ID</div>
          <div id="panelSessionId" class="panel-row-value code">-</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">工作区</div>
          <div id="panelSessionPath" class="panel-row-value code">-</div>
        </div>
      </div>
    </div>
    <div class="panel-card">
      <div class="panel-title">运行状态</div>
      <div class="panel-grid">
        <div class="panel-row">
          <div class="panel-row-label">Agent</div>
          <div id="panelAgent" class="panel-row-value">离线</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">状态</div>
          <div id="panelRunState" class="panel-row-value">空闲</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">队列</div>
          <div id="panelQueue" class="panel-row-value">0 项</div>
        </div>
      </div>
    </div>
    <div class="panel-card">
      <div class="panel-title">快捷键</div>
      <div class="panel-grid">
        <div class="panel-row">
          <div class="panel-row-label">发送</div>
          <div class="panel-row-value code">Enter</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">换行</div>
          <div class="panel-row-value code">Shift + Enter</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-label">侧边栏</div>
          <div class="panel-row-value code">侧边栏按钮</div>
        </div>
      </div>
    </div>
  </aside>
</div>
<div id="debug"></div>
</div>
<script>
const KEY = new URLSearchParams(location.search).get('key') || localStorage.getItem('codex_key') || '';
if (KEY) localStorage.setItem('codex_key', KEY);
const DEBUG_MODE = new URLSearchParams(location.search).get('debug') === '1';

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = proto + '://' + location.host + '/ws/client' + (KEY ? '?key=' + encodeURIComponent(KEY) : '');
let ws = null;
let currentSession = null;
let sessions = [];
let connected = false;
let sidebarQuery = '';
let lastStatus = { running: false, current: null, owner: null, queue: [] };
const collapsedGroups = {};

const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const messages = $('messages');
const inputEl = $('input');
const sendBtn = $('sendBtn');
const debugEl = $('debug');
const searchInput = $('searchInput');
const debugLog = [];

const ICONS = {
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.94l-.81-1.22A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4.6H9A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.65 0 1.23.38 1.51 1H21a2 2 0 1 1 0 4h-.09c-.28.62-.86 1-1.51 1Z"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'panel-right': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M15 4v16"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'
};

function icon(name, size) {
  const body = ICONS[name] || '';
  return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

function setupChrome() {
  $('toggleSidebar').innerHTML = icon('menu', 16);
  $('toggleInfo').innerHTML = icon('panel-right', 16);
  $('sendBtn').innerHTML = icon('send', 16) + '<span>发送</span>';
  $('searchIcon').innerHTML = ICONS.search;
  debugEl.classList.toggle('visible', DEBUG_MODE);
}

setupChrome();
function dbg(line) {
  const t = new Date().toLocaleTimeString();
  debugLog.unshift('[' + t + '] ' + line);
  if (debugLog.length > 30) debugLog.length = 30;
  debugEl.innerHTML = debugLog.map(s => '<div>' + escapeHtml(s) + '</div>').join('');
}
dbg('page loaded');

// Sidebar toggle (mobile-friendly)
const backdropEl = $('backdrop');
const infoPanel = $('infoPanel');
const toggleInfoBtn = $('toggleInfo');
const appEl = document.querySelector('.app');
function syncBackdrop() {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const isInfoDrawer = window.matchMedia('(max-width: 1180px)').matches;
  const sidebarOpen = !$('sidebarShell').classList.contains('collapsed');
  const infoOpen = !appEl.classList.contains('info-collapsed') && infoPanel.classList.contains('drawer-open');
  backdropEl.classList.toggle('visible', (isMobile && sidebarOpen) || (isInfoDrawer && infoOpen));
}
function sidebarOpen() {
  appEl.classList.remove('sidebar-collapsed');
  $('sidebarShell').classList.remove('collapsed');
  syncBackdrop();
}
function sidebarClose() {
  appEl.classList.add('sidebar-collapsed');
  $('sidebarShell').classList.add('collapsed');
  syncBackdrop();
}
function sidebarToggle() {
  if ($('sidebarShell').classList.contains('collapsed')) sidebarOpen();
  else sidebarClose();
}
function isInfoDrawerMode() {
  return window.matchMedia('(max-width: 1180px)').matches;
}
function isInfoCollapsed() {
  return appEl.classList.contains('info-collapsed') || (isInfoDrawerMode() && !infoPanel.classList.contains('drawer-open'));
}
function infoOpen() {
  appEl.classList.remove('info-collapsed');
  if (isInfoDrawerMode()) infoPanel.classList.add('drawer-open');
  else infoPanel.classList.remove('drawer-open');
  syncBackdrop();
}
function infoClose() {
  appEl.classList.add('info-collapsed');
  infoPanel.classList.remove('drawer-open');
  syncBackdrop();
}
function infoShowInline() {
  appEl.classList.remove('info-collapsed');
  infoPanel.classList.remove('drawer-open');
  syncBackdrop();
}
let currentLayoutMode = '';
function getLayoutMode() {
  if (window.matchMedia('(max-width: 900px)').matches) return 'mobile';
  if (isInfoDrawerMode()) return 'compact';
  return 'wide';
}
function syncResponsiveLayout(force) {
  const mode = getLayoutMode();
  if (!force && mode === currentLayoutMode) {
    syncBackdrop();
    return;
  }
  currentLayoutMode = mode;
  if (mode === 'mobile') {
    sidebarClose();
    infoClose();
  } else {
    appEl.classList.remove('sidebar-collapsed');
    $('sidebarShell').classList.remove('collapsed');
    if (mode === 'compact') infoClose();
    else infoShowInline();
  }
}
syncResponsiveLayout(true);
window.addEventListener('resize', () => syncResponsiveLayout(false));
$('toggleSidebar').onclick = sidebarToggle;
toggleInfoBtn.onclick = () => {
  if (isInfoCollapsed()) infoOpen();
  else infoClose();
};
backdropEl.onclick = () => { sidebarClose(); infoClose(); };

function setAgentOnline(v) {
  connected = v;
  $('agentDot').className = 'status-dot ' + (v ? 'online' : '');
  $('agentState').textContent = v ? 'Agent 在线' : 'Agent 离线';
  $('panelAgent').textContent = v ? '在线' : '离线';
  if (!v) renderOfflineSidebar();
  updateComposerState();
  renderInfoPanel();
}
setAgentOnline(false);

function setStatus(s) {
  // s: { running, current, owner, queue }
  s = s || lastStatus;
  lastStatus = s;
  $('runDot').className = 'status-dot ' + (s.running ? 'running' : '');
  $('runState').textContent = s.running ? ('运行中' + (s.current ? ': ' + s.current : '')) : '空闲';
  $('ownerState').textContent = s.owner ? ('占用者：' + s.owner) : '';
  $('ownerPill').style.display = s.owner ? 'inline-flex' : 'none';
  $('panelRunState').textContent = s.running ? '运行中' : '空闲';
  $('panelQueue').textContent = formatQueueCount((s.queue || []).length);
  const q = $('queue');
  if (s.queue && s.queue.length) {
    q.style.display = 'block';
    q.textContent = '队列（' + s.queue.length + '）：' + s.queue.slice(0, 3).join(' / ') + (s.queue.length > 3 ? ' ...' : '');
  } else { q.style.display = 'none'; }
  // refresh sidebar running indicator
  document.querySelectorAll('.conversation-item').forEach(el => {
    el.classList.toggle('running', el.dataset.id === s.current && s.running);
  });
  renderInfoPanel();
}

function renderSidebar(list) {
  sessions = list || [];
  const filtered = filterSessions(sessions);
  if (!filtered.length) {
    sidebar.innerHTML = '<div class="empty">' + (sessions.length ? '没有匹配的会话' : '暂无会话') + '</div>';
    return;
  }
  const groups = groupSessions(filtered);
  sidebar.innerHTML =
    '<div class="sidebar-section">' +
      '<div class="sidebar-section-header">' +
        '<div class="sidebar-section-label">项目</div>' +
        '<div class="sidebar-section-note">' + escapeHtml(String(groups.length)) + ' 组</div>' +
      '</div>' +
      groups.map(group => {
        const key = group.key;
        const label = escapeHtml(group.label);
        const path = group.path ? escapeHtml(shortenPath(group.path)) : '';
        const containsCurrent = group.items.some(s => s.id === currentSession);
        const collapsed = isGroupCollapsed(key, containsCurrent);
        const items = group.items.map(renderSessionItem).join('');
        return '<div class="sidebar-card sidebar-group' + (collapsed ? ' collapsed' : '') + '">' +
          '<div class="group-header">' +
            '<button type="button" class="group-toggle" data-group-key="' + escapeHtml(key) + '">' +
              '<div class="group-title"><span class="group-caret">' + icon('chevron', 14) + '</span><span>' + icon('folder', 14) + '</span><span>' + label + '</span><span class="group-count">' + group.items.length + '</span></div>' +
              (path ? '<div class="group-path">' + path + '</div>' : '') +
            '</button>' +
          '</div>' +
          '<div class="group-items">' + items + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  sidebar.querySelectorAll('.group-toggle').forEach(el => {
    el.onclick = () => toggleGroup(el.dataset.groupKey || '');
  });
  sidebar.querySelectorAll('.conversation-item').forEach(el => {
    el.onclick = () => selectSession(el.dataset.id);
  });
}

function renderOfflineSidebar() {
  sessions = [];
  sidebar.innerHTML = '<div class="empty">Agent 离线</div>';
}

function renderSessionItem(s) {
  const title = escapeHtml(s.title || s.id);
  const time = escapeHtml(formatSessionTime(s.id));
  const running = !!(lastStatus.running && lastStatus.current === s.id);
  const active = s.id === currentSession;
  return '<div class="' + (active ? 'conversation-item active' : 'conversation-item') + (running ? ' running' : '') + '" data-id="' + s.id + '" title="' + title + '">' +
    '<span class="conversation-badge">' + icon('terminal', 12) + '</span>' +
    '<div class="conversation-copy"><div class="conversation-title">' + title + '</div><div class="conversation-meta">' + time + '</div></div>' +
  '</div>';
}

function toggleGroup(key) {
  if (!key) return;
  collapsedGroups[key] = !isGroupCollapsed(key, false);
  renderSidebar(sessions);
}

function isGroupCollapsed(key, containsCurrent) {
  if (Object.prototype.hasOwnProperty.call(collapsedGroups, key)) {
    return collapsedGroups[key] === true;
  }
  return !containsCurrent;
}

function filterSessions(list) {
  if (!sidebarQuery) return list;
  return list.filter(s => {
    const title = String(s.title || '').toLowerCase();
    const path = String(s.cwd || '').toLowerCase();
    const id = String(s.id || '').toLowerCase();
    return title.includes(sidebarQuery) || path.includes(sidebarQuery) || id.includes(sidebarQuery);
  });
}

function groupSessions(list) {
  const groups = [];
  const byPath = new Map();
  for (const session of list) {
    const path = normalizePath(session.cwd || '');
    const key = path || '__other__';
    if (!byPath.has(key)) {
      const group = {
        key,
        path,
        label: path ? folderName(path) : '其他会话',
        items: [],
      };
      byPath.set(key, group);
      groups.push(group);
    }
    byPath.get(key).items.push(session);
  }
  return groups;
}

function normalizePath(p) {
  return String(p || '').replace(/[\\/]+$/, '');
}

function folderName(p) {
  const parts = normalizePath(p).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

function shortenPath(p) {
  const parts = p.split(/[\\\\/]/).filter(Boolean);
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

function setChatHeader(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) {
    $('headerTitle').textContent = '选择一个会话';
    $('chatTitle').textContent = '选择一个会话';
    $('chatPath').textContent = '连接 Agent 后查看会话历史';
    renderInfoPanel();
    return;
  }
  const title = s.title || s.id;
  const cwd = s.cwd || '无工作区';
  $('headerTitle').textContent = title;
  $('chatTitle').textContent = title;
  $('chatPath').textContent = cwd;
  renderInfoPanel();
}

function renderInfoPanel() {
  const s = sessions.find(x => x.id === currentSession);
  $('panelSessionTitle').textContent = s ? (s.title || s.id) : '未选择会话';
  $('panelSessionId').textContent = s ? s.id : '-';
  $('panelSessionPath').textContent = s ? (s.cwd || '-') : '-';
  $('panelRunState').textContent = lastStatus.running ? '运行中' : '空闲';
  $('panelQueue').textContent = formatQueueCount((lastStatus.queue || []).length);
}

function formatQueueCount(n) {
  return (n || 0) + ' 项';
}

function formatSessionTime(id) {
  const m = String(id || '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  if (!m) return '会话';
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
}

function isNoise(text) {
  if (!text) return false;
  const t = text.trim();
  if (!t) return true;
  if (/^OpenAI Codex v/.test(t)) return true;
  if (/^-+$/.test(t)) return true;
  if (/^workdir:/i.test(t)) return true;
  if (/^model:/i.test(t)) return true;
  if (/^provider:/i.test(t)) return true;
  if (/^approval:/i.test(t)) return true;
  if (/^reasoning effort:/i.test(t)) return true;
  if (/^reasoning summaries:/i.test(t)) return true;
  if (/^session id:/i.test(t)) return true;
  if (/^: - \[/.test(t)) return true;
  if (/^tokens used/.test(t)) return true;
  if (t === 'user' || t === 'codex' || t === 'assistant') return true;
  if (/^\d{4}-\d{2}-\d{2}T.*ERROR/.test(t)) return true;
  if (/failed to record rollout items/.test(t)) return true;
  if (/^[\d,]+$/.test(t) && t.length <= 12) return true;
  if (/^The user is just testing/.test(t)) return true;
  if (/^I'll keep it brief/.test(t)) return true;
  return false;
}

function selectSession(id) {
  currentSession = id;
  const session = sessions.find(x => x.id === id);
  if (session) {
    const key = normalizePath(session.cwd || '') || '__other__';
    collapsedGroups[key] = false;
  }
  messages.innerHTML = '';
  setChatHeader(id);
  renderSidebar(sessions);
  updateComposerState();
  send({ type: 'select', session: id });
  if (window.matchMedia('(max-width: 900px)').matches) { sidebarClose(); infoClose(); }
}

function appendMessage(kind, text) {
  if (isNoise(text)) return;
  const lastRow = messages.lastElementChild;
  if (lastRow && lastRow.classList.contains('row') && lastRow.classList.contains(kind)) {
    const lastBubble = lastRow.querySelector('.bubble');
    if (lastBubble && lastBubble.dataset.raw === text) return;
  }
  const row = document.createElement('div');
  row.className = 'row ' + kind;
  const shell = document.createElement('div');
  shell.className = 'message-shell';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = messageLabel(kind);
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + kind;
  bubble.dataset.raw = text;
  bubble.innerHTML = renderMessageContent(kind, text);
  shell.appendChild(meta);
  shell.appendChild(bubble);
  row.appendChild(shell);
  if (messages.firstChild && messages.firstChild.className === 'empty') messages.innerHTML = '';
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

let thinkingEl = null;
function showThinking() {
  clearThinking();
  const row = document.createElement('div');
  row.className = 'row agent';
  const shell = document.createElement('div');
  shell.className = 'message-shell';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = 'Codex';
  const b = document.createElement('div');
  b.className = 'bubble agent thinking';
  b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Codex 正在思考...';
  shell.appendChild(meta);
  shell.appendChild(b);
  row.appendChild(shell);
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

function messageLabel(kind) {
  if (kind === 'user') return '你';
  if (kind === 'agent') return 'Codex';
  if (kind === 'error') return '错误';
  return '系统';
}

function renderMessageContent(kind, text) {
  if (kind === 'system' || kind === 'error') {
    return '<div class="markdown"><p>' + escapeHtml(text) + '</p></div>';
  }
  return renderMarkdown(text);
}

function renderMarkdown(text) {
  const source = String(text || '');
  const chunks = [];
  const fence = '\`\`\`';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(fence, cursor);
    if (start < 0) {
      chunks.push(renderMarkdownText(source.slice(cursor)));
      break;
    }
    if (start > cursor) {
      chunks.push(renderMarkdownText(source.slice(cursor, start)));
    }
    const fenceEnd = source.indexOf('\n', start + fence.length);
    if (fenceEnd < 0) {
      chunks.push(renderMarkdownText(source.slice(start)));
      break;
    }
    const language = source.slice(start + fence.length, fenceEnd).trim() || 'text';
    const blockEnd = source.indexOf(fence, fenceEnd + 1);
    if (blockEnd < 0) {
      chunks.push(renderCodeBlock(language, source.slice(fenceEnd + 1)));
      break;
    }
    chunks.push(renderCodeBlock(language, source.slice(fenceEnd + 1, blockEnd)));
    cursor = blockEnd + fence.length;
  }
  return '<div class="markdown">' + chunks.join('') + '</div>';
}

function renderMarkdownText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      const level = Math.min(3, line.match(/^#+/)[0].length);
      out.push('<h' + level + '>' + renderInline(line.replace(/^#{1,3}\s+/, '')) + '</h' + level + '>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + quote.map(renderInline).join('<br>') + '</blockquote>');
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push('<li>' + renderInline(lines[i].replace(/^[-*]\s+/, '')) + '</li>');
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push('<li>' + renderInline(lines[i].replace(/^\d+\.\s+/, '')) + '</li>');
        i++;
      }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }
    if (isTableStart(lines, i)) {
      const tableLines = [lines[i]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }
    if (/^\$\$[\s\S]*\$\$$/.test(line.trim())) {
      out.push('<div class="math-block">' + escapeHtml(line.trim().slice(2, -2).trim()) + '</div>');
      i++;
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !isTableStart(lines, i)) {
      paragraph.push(lines[i]);
      i++;
    }
    out.push('<p>' + renderInline(paragraph.join(' ')) + '</p>');
  }
  return out.join('');
}

function renderInline(text) {
  let safe = escapeHtml(text);
  const placeholders = [];
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const token = '@@LINK' + placeholders.length + '@@';
    placeholders.push('<a href="' + url + '" target="_blank" rel="noreferrer">' + label + '</a>');
    return token;
  });
  safe = safe.replace(/(https?:\/\/[^\s<]+)/g, (_, url) => {
    const token = '@@LINK' + placeholders.length + '@@';
    placeholders.push('<a href="' + url + '" target="_blank" rel="noreferrer">' + url + '</a>');
    return token;
  });
  safe = safe.replace(/\$\$([^$]+)\$\$/g, (_, expr) => '<span class="math-inline">' + expr + '</span>');
  safe = safe.replace(/\$([^$]+)\$/g, (_, expr) => '<span class="math-inline">' + expr + '</span>');
  safe = safe.replace(/\`([^\`]+)\`/g, (_, code) => '<code class="inline-code">' + code + '</code>');
  placeholders.forEach((html, index) => {
    safe = safe.replace('@@LINK' + index + '@@', html);
  });
  return safe;
}

function renderCodeBlock(language, code) {
  const encoded = encodeURIComponent(code);
  return '<div class="code-block">' +
    '<div class="code-head"><div><strong>' + escapeHtml(language || 'text') + '</strong></div>' +
    '<button type="button" class="code-copy" data-copy="' + encoded + '">复制</button></div>' +
    '<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>' +
  '</div>';
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) return false;
  return lines[index].includes('|') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1]);
}

function renderTable(lines) {
  const rows = lines.map(splitTableRow);
  const head = rows.shift() || [];
  const body = rows;
  return '<table><thead><tr>' + head.map(cell => '<th>' + renderInline(cell) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map(row => '<tr>' + row.map(cell => '<td>' + renderInline(cell) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(part => part.trim());
}

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
        const online = !!m.online;
        setAgentOnline(online);
        if (online && m.sessions) renderSidebar(m.sessions);
        if (m.status) setStatus(m.status);
        break;
      case 'sessions':
        if (connected) renderSidebar(m.sessions);
        else renderOfflineSidebar();
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

function autoResizeInput() {
  inputEl.style.height = '0px';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 260) + 'px';
}

function updateComposerState() {
  sendBtn.disabled = !(connected && currentSession && inputEl.value.trim());
}

searchInput.addEventListener('input', e => {
  sidebarQuery = String(e.target.value || '').trim().toLowerCase();
  if (connected) renderSidebar(sessions);
  else renderOfflineSidebar();
});

sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text || !currentSession) return;
  send({ type: 'send', session: currentSession, text });
  inputEl.value = '';
  autoResizeInput();
  updateComposerState();
};
inputEl.addEventListener('input', () => {
  autoResizeInput();
  updateComposerState();
});
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

messages.addEventListener('click', async e => {
  const btn = e.target.closest('.code-copy');
  if (!btn || !navigator.clipboard) return;
  const text = decodeURIComponent(btn.dataset.copy || '');
  await navigator.clipboard.writeText(text);
  btn.classList.add('copied');
  btn.textContent = '已复制';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.textContent = '复制';
  }, 1200);
});

autoResizeInput();
updateComposerState();
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


