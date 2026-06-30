import { CodexRoom } from "./codex-room";

export { CodexRoom };

interface Env {
  CODEX_ROOM: DurableObjectNamespace;
  AGENT_TOKEN: string;   // set via `wrangler secret put AGENT_TOKEN`
  BROWSER_PASSWORD?: string; // optional password for browser login
}

const HTML_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Codex Remote</title>
<script>
  (function () {
    try {
      document.documentElement.classList.toggle('light', localStorage.getItem('codex_theme') === 'light');
    } catch {}
  })();
</script>
<style>
  :root {
    color-scheme: dark;
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
    --error-soft: rgba(127, 29, 29, .12);
    --error-text: #fca5a5;
    --warning-soft: rgba(245, 158, 11, .08);
    --warning-border: rgba(245, 158, 11, .25);
    --warning-text: #fbbf24;
    --success-border: rgba(34, 197, 94, .35);
    --empty-bg: rgba(24, 27, 32, .35);
    --backdrop: rgba(0, 0, 0, .45);
    --scroll-thumb: #232831;
    --scroll-thumb-hover: #323846;
    --code-text: #d7dde8;
    --radius: 10px;
    --transition: 180ms ease-out;
    --theme-transition: 220ms ease;
  }
  html.light {
    color-scheme: light;
    --bg: #f5f6f8;
    --sidebar: #ffffff;
    --card: #ffffff;
    --hover: #eef1f5;
    --border: #d8dde5;
    --text: #151922;
    --text-secondary: #4b5563;
    --muted: #7a8494;
    --accent: #2563eb;
    --success: #16a34a;
    --warning: #d97706;
    --error: #dc2626;
    --error-soft: rgba(220, 38, 38, .08);
    --error-text: #b91c1c;
    --warning-soft: rgba(217, 119, 6, .08);
    --warning-border: rgba(217, 119, 6, .22);
    --warning-text: #92400e;
    --success-border: rgba(22, 163, 74, .28);
    --empty-bg: rgba(255, 255, 255, .7);
    --backdrop: rgba(15, 23, 42, .32);
    --scroll-thumb: #c4cad3;
    --scroll-thumb-hover: #a8b0bd;
    --code-text: #263244;
  }
  * { box-sizing: border-box; }
  html.theme-switching *,
  html.theme-switching *::before,
  html.theme-switching *::after {
    transition: none !important;
  }
  html, body { height: 100%; }
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }
  ::view-transition-old(root) { z-index: 1; }
  ::view-transition-new(root) { z-index: 2147483646; }
  body {
    margin: 0;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
    transition: background-color var(--theme-transition), color var(--theme-transition);
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
    transition: background-color var(--theme-transition), border-color var(--theme-transition);
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
    transition: background-color var(--theme-transition), border-color var(--theme-transition), color var(--theme-transition);
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
    transition: width var(--transition), background-color var(--theme-transition), border-color var(--transition);
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
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
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
    background: color-mix(in srgb, var(--hover) 76%, var(--card));
    border-color: color-mix(in srgb, var(--border) 70%, var(--text-secondary));
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
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
    color: var(--muted);
  }
  .conversation-item.running .conversation-badge {
    color: var(--warning);
    border-color: var(--warning-border);
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
    background: color-mix(in srgb, var(--card) 80%, var(--hover));
    border-color: color-mix(in srgb, var(--border) 70%, var(--text-secondary));
  }
  .bubble.system {
    background: transparent;
    border-style: dashed;
    color: var(--text-secondary);
  }
  .bubble.error {
    border-color: color-mix(in srgb, var(--error) 35%, transparent);
    color: var(--error-text);
    background: var(--error-soft);
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
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
    font-weight: 600;
  }
  .inline-code {
    display: inline-block;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
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
    background: color-mix(in srgb, var(--card) 84%, var(--bg));
    border: 1px solid var(--border);
  }
  .math-block {
    display: block;
    margin: 8px 0 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
    overflow-x: auto;
  }
  .code-block {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--card) 82%, var(--bg));
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
    background: color-mix(in srgb, var(--card) 90%, var(--bg));
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
    border-color: var(--success-border);
  }
  .code-block pre {
    margin: 0;
    padding: 14px 16px 16px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--code-text);
  }
  .composer-wrap {
    padding: 0 24px 24px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .queue {
    margin: 12px 0 0;
    padding: 10px 12px;
    border: 1px solid var(--warning-border);
    border-radius: 10px;
    background: var(--warning-soft);
    color: var(--warning-text);
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
    background: color-mix(in srgb, var(--card) 72%, var(--hover));
    color: var(--text);
    border-color: color-mix(in srgb, var(--border) 70%, var(--text-secondary));
  }
  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--hover) 76%, var(--card));
    border-color: color-mix(in srgb, var(--border) 55%, var(--text-secondary));
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
  .theme-button {
    position: relative;
  }
  .theme-button svg {
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    transition: opacity var(--transition), transform var(--transition);
  }
  .theme-button .sun-icon {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(-45deg) scale(.72);
  }
  .theme-button .moon-icon {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0) scale(1);
  }
  html.light .theme-button .sun-icon {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0) scale(1);
  }
  html.light .theme-button .moon-icon {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(45deg) scale(.72);
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
    transition: background-color var(--theme-transition), border-color var(--theme-transition);
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
    background: var(--empty-bg);
  }
  .backdrop {
    position: fixed;
    inset: 48px 0 0;
    background: var(--backdrop);
    display: none;
    z-index: 40;
  }
  .backdrop.visible {
    display: block;
  }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 999px; }
  *::-webkit-scrollbar-thumb:hover { background: var(--scroll-thumb-hover); }
  * { scrollbar-width: thin; scrollbar-color: var(--scroll-thumb) transparent; }
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
    background: color-mix(in srgb, var(--card) 86%, var(--bg));
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
      <div class="header-title">Codex Remote</div>
    </div>
  </div>
  <div class="header-status">
    <div class="status-pill"><span id="agentDot" class="status-dot"></span><span id="agentState">Agent 离线</span></div>
    <div class="status-pill"><span id="runDot" class="status-dot"></span><span id="runState">空闲</span></div>
    <div id="ownerPill" class="status-pill" style="display:none"><span id="ownerState">占用者：web</span></div>
  </div>
  <div class="header-right">
    <button id="themeToggle" class="iconbtn theme-button" type="button" aria-label="切换主题" title="切换主题">
      <span class="sun-icon"></span>
      <span class="moon-icon"></span>
    </button>
  </div>
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
        <div id="chatTitle" class="conversation-head-title">sessions</div>
        <div id="chatPath" class="conversation-head-path"></div>
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
const DEBUG_MODE = new URLSearchParams(location.search).get('debug') === '1';
const rootEl = document.documentElement;
const savedTheme = localStorage.getItem('codex_theme');
rootEl.classList.toggle('light', savedTheme === 'light');

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = proto + '://' + location.host + '/ws/client';
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
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
};

function icon(name, size) {
  const body = ICONS[name] || '';
  return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

function setupChrome() {
  $('toggleSidebar').innerHTML = icon('menu', 16);
  $('toggleInfo').innerHTML = icon('panel-right', 16);
  document.querySelector('#themeToggle .sun-icon').innerHTML = icon('sun', 19);
  document.querySelector('#themeToggle .moon-icon').innerHTML = icon('moon', 19);
  $('sendBtn').innerHTML = icon('send', 16) + '<span>发送</span>';
  $('searchIcon').innerHTML = ICONS.search;
  debugEl.classList.toggle('visible', DEBUG_MODE);
}

setupChrome();
syncThemeButton();
function dbg(line) {
  const t = new Date().toLocaleTimeString();
  debugLog.unshift('[' + t + '] ' + line);
  if (debugLog.length > 30) debugLog.length = 30;
  debugEl.innerHTML = debugLog.map(s => '<div>' + escapeHtml(s) + '</div>').join('');
}
dbg('page loaded');

function isLightTheme() {
  return rootEl.classList.contains('light');
}

function syncThemeButton() {
  const btn = $('themeToggle');
  if (!btn) return;
  btn.title = isLightTheme() ? '切换到夜间模式' : '切换到白天模式';
  btn.setAttribute('aria-label', btn.title);
}

function applyTheme(isLight) {
  rootEl.classList.toggle('light', isLight);
  localStorage.setItem('codex_theme', isLight ? 'light' : 'dark');
  syncThemeButton();
}

function toggleTheme(event) {
  const wasLight = isLightTheme();
  const nextLight = !wasLight;
  if (!document.startViewTransition) {
    applyTheme(nextLight);
    return;
  }
  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  rootEl.classList.add('theme-switching');
  const transition = document.startViewTransition(() => {
    applyTheme(nextLight);
  });
  transition.ready.then(() => {
    const clipPath = [
      'circle(0px at ' + x + 'px ' + y + 'px)',
      'circle(' + endRadius + 'px at ' + x + 'px ' + y + 'px)',
    ];
    rootEl.animate(
      { clipPath },
      {
        duration: 400,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  }).catch(() => {});
  transition.finished.finally(() => {
    rootEl.classList.remove('theme-switching');
  });
}

$('themeToggle').onclick = toggleTheme;

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
    $('chatTitle').textContent = 'sessions';
    $('chatPath').textContent = '';
    renderInfoPanel();
    return;
  }
  const title = s.title || s.id;
  const cwd = s.cwd || '无工作区';
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

const LOGIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Codex Remote 登录</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1115;
    --card: #181b20;
    --border: #2a2f38;
    --text: #ffffff;
    --text-secondary: #9ca3af;
    --muted: #6b7280;
    --accent: #3b82f6;
    --error: #fca5a5;
    --error-bg: rgba(127, 29, 29, .16);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: linear-gradient(135deg, #0f1115 0%, #141821 100%);
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .login {
    width: min(420px, 100%);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--card) 92%, var(--bg));
    padding: 28px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, .32);
  }
  .brand {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 6px;
  }
  h1 {
    margin: 0 0 22px;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 650;
    letter-spacing: 0;
  }
  label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  input {
    width: 100%;
    height: 42px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #11141a;
    color: var(--text);
    padding: 0 12px;
    font: inherit;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, .18);
  }
  button {
    width: 100%;
    height: 42px;
    margin-top: 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 78%, #11141a);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: .65;
    cursor: wait;
  }
  .error {
    display: none;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--error-bg);
    color: var(--error);
    font-size: 13px;
  }
  .error.show { display: block; }
</style>
</head>
<body>
  <form class="login" id="loginForm">
    <div class="brand">Codex Remote</div>
    <h1>登录</h1>
    <label for="password">访问密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
    <button id="loginButton" type="submit">进入</button>
    <div id="error" class="error">密码不正确</div>
  </form>
<script>
const form = document.getElementById('loginForm');
const password = document.getElementById('password');
const button = document.getElementById('loginButton');
const error = document.getElementById('error');
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  error.classList.remove('show');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    });
    if (!res.ok) throw new Error('login failed');
    const next = new URLSearchParams(location.search).get('next') || '/';
    location.assign(next);
  } catch {
    error.classList.add('show');
    password.select();
  } finally {
    button.disabled = false;
  }
});
</script>
</body>
</html>`;

function json(data: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

const AUTH_COOKIE = "codex_remote_auth";
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

async function checkBrowserAuth(request: Request, env: Env): Promise<boolean> {
  if (!env.BROWSER_PASSWORD) return true;
  const token = readCookie(request, AUTH_COOKIE);
  if (!token) return false;
  return verifyAuthToken(token, env.BROWSER_PASSWORD);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.BROWSER_PASSWORD) return json({ ok: true });
  const password = await readPassword(request);
  if (password !== env.BROWSER_PASSWORD) {
    return json({ error: "bad password" }, 401);
  }
  const token = await createAuthToken(env.BROWSER_PASSWORD);
  return json({ ok: true }, 200, {
    "set-cookie": serializeAuthCookie(request, token, AUTH_MAX_AGE_SECONDS),
  });
}

function logoutResponse(request: Request): Response {
  return redirect("/login", 302, {
    "set-cookie": serializeAuthCookie(request, "", 0),
  });
}

async function readPassword(request: Request): Promise<string> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => null) as { password?: unknown } | null;
    return typeof body?.password === "string" ? body.password : "";
  }
  const form = await request.formData().catch(() => null);
  const value = form?.get("password");
  return typeof value === "string" ? value : "";
}

async function createAuthToken(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + AUTH_MAX_AGE_SECONDS;
  const payload = `v1.${expires}`;
  const signature = await signAuthPayload(payload, secret);
  return `${payload}.${signature}`;
}

async function verifyAuthToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = await signAuthPayload(payload, secret);
  return timingSafeEqual(parts[2], expected);
}

async function signAuthPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64Url(signature);
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function readCookie(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return "";
}

function serializeAuthCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function redirect(location: string, status = 302, headers: Record<string,string> = {}): Response {
  return new Response(null, {
    status,
    headers: { location, ...headers },
  });
}

function loginRedirect(request: Request): Response {
  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  return redirect(`/login?next=${next}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Frontend ----------------------------------------------------------
    if (path === "/login" && request.method === "GET") {
      if (await checkBrowserAuth(request, env)) return redirect("/");
      return new Response(LOGIN_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/logout") {
      return logoutResponse(request);
    }
    if (path === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (path === "/" || path === "/index.html") {
      if (!await checkBrowserAuth(request, env)) return loginRedirect(request);
      return new Response(HTML_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // --- WebSocket: browser & agent ---------------------------------------
    if (path === "/ws/client") {
      if (!await checkBrowserAuth(request, env)) return json({ error: "login required" }, 401);
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
      if (!await checkBrowserAuth(request, env)) return json({ error: "login required" }, 401);
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


