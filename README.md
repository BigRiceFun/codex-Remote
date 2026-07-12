# Codex Remote Web 控制台

## 背景

Codex 桌面版本身支持和手机 App 同步会话，但前提是桌面端和手机端登录同一个账号。这样在手机上打开 App 时，才能看到电脑上的会话，并继续控制电脑里的 Codex。

我的日常使用方式不太一样：我通常是直接用 API 登录 Codex 桌面版，而不是通过同一个账号体系登录。这样一来，手机 App 就无法同步这些桌面端会话，也就没法在手机上继续控制电脑上的 Codex。

所以我做了这个项目：通过浏览器、Cloudflare Worker 和本地 Windows Agent，把电脑上的 Codex 会话暴露成一个自己的远程 Web 控制台。这样即使用 API 方式登录桌面版，也可以从手机浏览器查看会话、发送消息、接收实时输出。

浏览器 → Cloudflare Worker (Durable Object) → Windows Agent → Codex CLI。

## 目录结构

```
codex-Remote/
├─ doc/方案.md
├─ worker/           Cloudflare Worker + DO (TypeScript)
│  ├─ src/worker.ts
│  ├─ src/codex-room.ts
│  ├─ wrangler.toml
│  └─ package.json
└─ agent/            Windows Agent (Go 单二进制)
   ├─ main.go
   ├─ engine.go
   ├─ sessions.go
   ├─ protocol.go
   └─ go.mod
```

## 架构

```
Browser  ── HTTPS/WSS ──▶  Cloudflare Worker  ── WSS ──▶  Windows Agent  ──▶  Codex CLI
                              + Durable Object
                          (房间 = "default"，消息中继/广播)
```

Durable Object `CodexRoom`：
- 维护一个 agent 连接 + 多个 browser 连接
- 缓存最近 500 行 stream，供新连接回看
- 维护 `sessions` 列表和 `status`（running/current/owner/queue）
- 对外 REST：`/api/sessions` `/api/status` `/api/send`
- 对外 WS：`/ws/client` `/ws/agent`

---

## WebSocket 协议

### browser → worker (`/ws/client`)
```json
{ "type": "hello" }
{ "type": "select", "session": "<id>" }      // 切换会话，触发回放缓冲
{ "type": "send",   "session": "<id>", "text": "..." }
```

### agent → worker (`/ws/agent`，token 通过 `X-Codex-Token` 请求头传递)
```json
{ "type": "sessions", "sessions": [{ "id": "...", "title": "..." }] }
{ "type": "status",   "status":  { "running": true, "current": "abc", "owner": "web", "queue": [] } }
{ "type": "stream",   "session": "abc", "content": "正在分析..." }
{ "type": "system",   "session": "abc", "content": "codex started" }
{ "type": "error",    "session": "abc", "content": "..." }
```

### worker → agent (server.push)
```json
{ "type": "send", "session": "<id>", "text": "..." }
```

### worker → 所有 browser (broadcast)
- `hello` / `agent_status`：在线状态 + sessions + status
- `sessions`：列表更新
- `status`：running/current/owner/queue 更新
- `stream`：实时输出
- `input_echo`：回显用户输入
- `system` / `error`

---

## 输入控制 / 排队

Engine 状态：

- `running`：是否有 codex 进程在跑
- `currentSession`：当前运行的会话
- `queue`：待发送消息队列（纯文本或 `[session] text` 跨会话标签）
- `owner`：当前持有输入锁的角色，5 分钟无操作自动释放

规则：

- 若发往当前 session 且 running=true → 入队
- 若发往不同 session 且 running=true → 入队并加 `[session]` 前缀，出队时切换会话
- codex 进程退出后，自动出队发送下一条

---

## 部署步骤

### 1) Worker

```bash
cd worker
npm install

# 设置 agent token（secret）
npx wrangler secret put AGENT_TOKEN
# 粘贴一个随机字符串，比如 64 位 hex

# 设置浏览器访问密码（生产环境必填，未配置时 Worker 默认拒绝访问）
npx wrangler secret put BROWSER_PASSWORD

npx wrangler deploy
```

部署后你会得到 `https://codex-remote.<you>.workers.dev`。

> 首次部署带 `new_classes` migration；后续修改 DO 结构时再加新的 migration tag 即可。

### 2) Agent (Windows)

需要 Go 1.22+：

```bash
cd agent
go mod tidy
go build -o codex-agent.exe .

# 运行（任选一种 token 传递方式）
$env:CODEX_AGENT_TOKEN = "刚才那个 token"
$env:CODEX_WORKER      = "wss://codex-remote.<you>.workers.dev/ws/agent"
./codex-agent.exe

# 或者命令行
./codex-agent.exe -worker "wss://codex-remote.<you>.workers.dev/ws/agent" -token "..."
```

或把 token 存到 `~/.codex/remote-token`，省略 `-token`。

确认 agent 启动后日志出现 `connected to ...`。

### 3) 浏览器

直接打开：

```
https://codex-remote.<you>.workers.dev/
```

打开后会先进入登录页：

```
https://codex-remote.<you>.workers.dev/
```

---

## 本地联调

```bash
# 终端 1：起 worker
cd worker && npx wrangler dev      # 默认 http://localhost:8787

# 终端 2：起 agent（连本地）
cd agent && go run . -worker "ws://localhost:8787/ws/agent" -token "dev-token"
# (并在 worker 里临时把 AGENT_TOKEN 设为 "dev-token"，比如 .dev.vars)
```

`.dev.vars` 示例：

```
AGENT_TOKEN=dev-token
BROWSER_PASSWORD=dev-password
# 仅在明确需要无密码本地调试时使用：
# ALLOW_UNAUTHENTICATED=true
```

浏览器开 `http://localhost:8787/`。

---

## 安全说明

- Agent → Worker：必须通过 `X-Codex-Token` 请求头携带 token，并和 Worker 的 `AGENT_TOKEN` secret 比对；token 不进入 URL 或日志。
- Browser → Worker：必须配置 `BROWSER_PASSWORD`，登录成功后写入 HttpOnly Cookie；连续失败 5 次会锁定 15 分钟。仅本地调试可显式设置 `ALLOW_UNAUTHENTICATED=true`。
- 全链路 HTTPS/WSS。

---

## 已知限制 / 扩展点

- 每个 Worker 只有一个 `default` 房间（所有 browser 共享一个 agent）。多用户隔离时换成按用户 ID 分房间。
- Agent 单条 stdout 行即一条 stream 消息，不做 token 级流式（Codex CLI 本身就是按行）。
- 审批 (approval)：每次请求带随机 `approvalId`，只发送给触发该会话运行的浏览器标签页；响应一次后立即失效，Agent 回执成功后页面才显示审批结果。
- 没有数据库；Durable Object 内存即所有状态，重启会丢历史（但 codex 会话文件仍在 `~/.codex`）。
