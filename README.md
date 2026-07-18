# Codex Remote Web 控制台

## 背景

Codex 桌面版本身支持和手机 App 同步会话，但前提是桌面端和手机端登录同一个账号。这样在手机上打开 App 时，才能看到电脑上的会话，并继续控制电脑里的 Codex。

我的日常使用方式不太一样：我通常是直接用 API 登录 Codex 桌面版，而不是通过同一个账号体系登录。这样一来，手机 App 就无法同步这些桌面端会话，也就没法在手机上继续控制电脑上的 Codex。

所以我做了这个项目：通过浏览器、Cloudflare Worker 和本地 Agent，把电脑或 Linux 服务器上的 Codex 会话暴露成一个自己的远程 Web 控制台。这样即使用 API 方式登录 Codex，也可以从手机浏览器查看会话、发送消息、接收实时输出。

浏览器 → Cloudflare Worker (Durable Object) → Windows/Linux Agent → Codex CLI。

## 致谢

感谢 [LINUX DO](https://linux.do/) 社区的支持与讨论


## 目录结构

```
codex-Remote/
├─ worker/           Cloudflare Worker + DO (TypeScript)
│  ├─ src/worker.ts
│  ├─ src/codex-room.ts
│  ├─ wrangler.toml
│  └─ package.json
└─ agent/            Windows/Linux Agent (Go 单二进制)
   ├─ appserver.go
   ├─ main.go
   ├─ engine.go
   ├─ sessions.go
   ├─ protocol.go
   └─ go.mod
```

## 架构

```
Browser  ── HTTPS/WSS ──▶  Cloudflare Worker  ── WSS ──▶  Windows/Linux Agent  ──▶  Codex CLI
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

先准备一个 Cloudflare 账户。本机不需要全局安装 Wrangler，项目依赖会提供对应版本。

```bash
# 1. 安装项目依赖
cd worker
npm install

# 2. 登录 Cloudflare
# 命令会打开浏览器，登录 Cloudflare 并确认授权
npx wrangler login

# 3. 检查登录状态和当前账户
npx wrangler whoami

# 4. 首次创建 Worker 和 Durable Object
npx wrangler deploy

# 5. 设置 Agent 连接密钥
npx wrangler secret put AGENT_TOKEN
# 按提示粘贴一个足够长的随机字符串，例如 64 位十六进制字符串

# 6. 设置网页登录密码
npx wrangler secret put BROWSER_PASSWORD
# 按提示输入浏览器访问 Codex Remote 时使用的密码

# 7. 再次部署，确认源码和配置均为最新版本
npx wrangler deploy
```

`npx wrangler login` 完成的 OAuth 登录信息会保存在本机 Wrangler 配置目录中，之后部署或更新不需要重复登录。登录失效时重新执行该命令即可。

第一次执行 `npx wrangler deploy` 时还没有配置 Secret，但此时 Worker 会拒绝网页登录和 Agent 连接，不会以无密码模式开放。两个 Secret 配置完成后才能正常使用。

部署成功后，终端会显示类似下面的访问地址：

```text
https://codex-remote.<你的-workers.dev-子域>.workers.dev
```

以后更新 Worker 只需要：

```bash
cd worker
npm install
npx wrangler whoami
npx wrangler deploy
```

只有需要更换 Agent Token 或网页登录密码时，才重新执行对应的 `wrangler secret put` 命令。修改 `AGENT_TOKEN` 后，本地 Agent 使用的 Token 也必须同步更新。

> 首次部署带 `new_classes` migration；后续修改 DO 结构时再加新的 migration tag 即可。

### 2) Agent

Agent 支持 Windows amd64 和 Linux amd64/arm64。运行机器需要安装并登录 Codex CLI，且 `codex` 必须位于 Agent 进程的 `PATH` 中：

```bash
codex --version
codex app-server --help
```

需要 Go 1.22+。Windows 构建与运行：

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

Linux 构建与运行：

```bash
cd agent
go mod download
CGO_ENABLED=0 go build -trimpath -o codex-agent .

export CODEX_AGENT_TOKEN="刚才那个 token"
export CODEX_WORKER="wss://codex-remote.<you>.workers.dev/ws/agent"
./codex-agent

# 也可以直接传参
./codex-agent -worker "wss://codex-remote.<you>.workers.dev/ws/agent" -token "..."
```

在其他电脑交叉编译 Linux 版本：

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go -C agent build -trimpath -o codex-agent-linux-amd64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go -C agent build -trimpath -o codex-agent-linux-arm64 .
```

也可以把 token 存到运行用户的 `~/.codex/remote-token`，文件内容只放 token，即可省略 `-token`。Linux 建议设置权限：

```bash
chmod 600 ~/.codex/remote-token
```

确认 agent 启动后日志出现 `connected to ...`。

#### Linux systemd 常驻运行

先把二进制放到 `/opt/codex-remote/codex-agent`，创建仅 root 可读的 `/etc/codex-remote-agent.env`：

```ini
CODEX_WORKER=wss://codex-remote.<you>.workers.dev/ws/agent
CODEX_AGENT_TOKEN=替换为真实Token
```

执行 `chmod 600 /etc/codex-remote-agent.env`，然后创建 `/etc/systemd/system/codex-remote-agent.service`：

```ini
[Unit]
Description=Codex Remote Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=codex
WorkingDirectory=/home/codex
EnvironmentFile=/etc/codex-remote-agent.env
Environment=PATH=/home/codex/.local/bin:/home/codex/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/codex-remote/codex-agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`User=codex` 和 `/home/codex` 必须替换为已经完成 Codex 登录的 Linux 用户。先以该用户执行 `command -v codex`，如果 Codex 安装目录不在示例的 `PATH` 中，需要同步加入 `Environment=PATH=...`。启动并查看日志：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now codex-remote-agent
sudo journalctl -u codex-remote-agent -f
```

Agent 只主动连接 Worker 的 WSS 地址，不需要在服务器开放入站端口。同一 Linux 用户只能启动一个 Agent 实例。

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

## License

MIT。上游项目和下载的二进制继续遵循各自许可证。
