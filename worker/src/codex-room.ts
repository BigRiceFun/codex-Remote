// Durable Object: message relay between browser(s) and the single Windows agent.

interface ClientConn {
  kind: "client";
  ws: WebSocket;
  id: number;
}
interface AgentConn {
  kind: "agent";
  ws: WebSocket;
}

type Conn = ClientConn | AgentConn;

interface StatusPayload {
  running: boolean;
  current: string | null;
  owner: string | null;
  queue: string[];
}

export class CodexRoom {
  state: DurableObjectState;
  env: unknown;
  agent: AgentConn | null = null;
  clients: Map<number, ClientConn> = new Map();
  nextClientId = 1;

  // cached state mirrored from agent
  sessions: Array<{ id: string; title: string }> = [];
  status: StatusPayload = { running: false, current: null, owner: null, queue: [] };
  bufferedStreams: Map<string, string[]> = new Map(); // session -> recent lines

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.env = env;
    // simple periodic cleanup could go here
  }

  // --------------------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/ws/client") return this.handleClientWS(request);
    if (path === "/ws/agent")  return this.handleAgentWS(request);

    if (path === "/api/sessions") return json({ sessions: this.sessions, online: !!this.agent });
    if (path === "/api/status")   return json({ status: this.status, online: !!this.agent });
    if (path === "/api/send") {
      const body = await request.json() as { session?: string; text?: string };
      return this.handleSend(body.session ?? "", body.text ?? "");
    }
    return json({ error: "not found" }, 404);
  }

  // ----------------------------- Browser WS --------------------------------
  handleClientWS(request: Request): Response {
    // @ts-ignore global on Workers
    const upgrade = request.headers.get("upgrade") || "";
    if (!upgrade.toLowerCase().includes("websocket")) return json({ error: "ws required" }, 426);

    // @ts-ignore
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = (Object.values(pair) as [WebSocket, WebSocket]);
    serverSide.accept();

    const id = this.nextClientId++;
    const conn: ClientConn = { kind: "client", ws: serverSide, id };
    this.clients.set(id, conn);

    serverSide.addEventListener("message", (ev: MessageEvent) => this.onClientMessage(conn, ev.data));
    serverSide.addEventListener("close", () => { this.clients.delete(id); });
    serverSide.addEventListener("error", () => { this.clients.delete(id); });

    // send hello on the server side (will be delivered to the browser)
    this.sendTo(serverSide, {
      type: "hello",
      online: !!this.agent,
      sessions: this.sessions,
      status: this.status,
    });
    return new Response(null, { status: 101, webSocket: clientSide } as unknown as ResponseInit);
  }

  // ----------------------------- Agent WS ----------------------------------
  handleAgentWS(request: Request): Response {
    // @ts-ignore
    const upgrade = request.headers.get("upgrade") || "";
    if (!upgrade.toLowerCase().includes("websocket")) return json({ error: "ws required" }, 426);

    // close old agent if reconnecting
    if (this.agent) {
      try { this.agent.ws.close(); } catch {}
    }

    // @ts-ignore
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = (Object.values(pair) as [WebSocket, WebSocket]);
    serverSide.accept();

    this.agent = { kind: "agent", ws: serverSide };

    serverSide.addEventListener("message", (ev: MessageEvent) => this.onAgentMessage(ev.data));
    serverSide.addEventListener("close", () => {
      if (this.agent && this.agent.ws === serverSide) this.agent = null;
      this.broadcast({ type: "agent_status", online: false, sessions: this.sessions, status: this.status });
    });
    serverSide.addEventListener("error", () => {
      if (this.agent && this.agent.ws === serverSide) this.agent = null;
    });

    this.broadcast({ type: "agent_status", online: true, sessions: this.sessions, status: this.status });
    return new Response(null, { status: 101, webSocket: clientSide } as unknown as ResponseInit);
  }

  // ----------------------------- Client messages ---------------------------
  onClientMessage(conn: ClientConn, raw: unknown) {
    let m: any;
    try { m = JSON.parse(typeof raw === "string" ? raw : ""); } catch { return; }
    if (!m || typeof m !== "object") return;

    switch (m.type) {
      case "hello":
        this.sendTo(conn.ws, {
          type: "agent_status",
          online: !!this.agent,
          sessions: this.sessions,
          status: this.status,
        });
        break;
      case "select": {
        const id = String(m.session || "");
        this.sendTo(conn.ws, { type: "system", session: id, content: "--- history ---" });
        // Tell the agent which session this client is viewing, so it can tail
        // only that jsonl instead of scanning everything.
        if (this.agent) {
          this.sendTo(this.agent.ws, { type: "watch", session: id });
          // Ask for history replay as well.
          this.sendTo(this.agent.ws, { type: "history", session: id });
        } else {
          this.sendTo(conn.ws, { type: "system", session: id, content: "(agent offline)" });
          this.sendTo(conn.ws, { type: "system", session: id, content: "--- end ---" });
        }
        break;
      }
      case "send":
        this.handleSend(String(m.session || ""), String(m.text || ""), conn);
        break;
      case "approval":
        this.handleApproval(String(m.session || ""), String(m.decision || ""));
        break;
    }
  }

  // ----------------------------- Agent messages ----------------------------
  onAgentMessage(raw: unknown) {
    if (!this.agent) return;
    let m: any;
    try { m = JSON.parse(typeof raw === "string" ? raw : ""); } catch { return; }
    if (!m || typeof m !== "object") return;

    switch (m.type) {
      case "sessions":
        this.sessions = Array.isArray(m.sessions) ? m.sessions : [];
        this.broadcast({ type: "sessions", sessions: this.sessions });
        break;
      case "status":
        this.status = {
          running: !!m.status?.running,
          current: m.status?.current ?? null,
          owner: m.status?.owner ?? null,
          queue: Array.isArray(m.status?.queue) ? m.status.queue : [],
        };
        this.broadcast({ type: "status", status: this.status });
        break;
      case "stream": {
        const id = String(m.session || "");
        const content = String(m.content || "");
        const buf = this.bufferedStreams.get(id) || [];
        buf.push(content);
        if (buf.length > 500) buf.splice(0, buf.length - 500);
        this.bufferedStreams.set(id, buf);
        this.broadcast({ type: "stream", session: id, content });
        break;
      }
      case "history": {
        // agent packs role + text as "role\u0001text"
        const session = String(m.session || "");
        const parts = String(m.content || "").split("\u0001");
        if (parts.length === 2) {
          const role = parts[0];
          const text = parts[1];
          // Agent packs role as "user" or "agent" (we renamed assistant->agent).
          this.broadcast({ type: role === "agent" ? "agent" : "user", session, content: text });
        }
        break;
      }
      case "system":
      case "error":
      case "approval":
        this.broadcast({ type: m.type, session: m.session || null, content: String(m.content || "") });
        break;
      default:
        // Forward any other typed message (e.g. "user", "agent") as-is so the
        // browser can render it.
        this.broadcast({ type: m.type, session: m.session || null, content: String(m.content || "") });
        break;
    }
  }

  // ----------------------------- Send handling -----------------------------
  async handleSend(session: string, text: string, fromClient?: ClientConn) {
    if (!this.agent) return json({ error: "agent offline" }, 503);
    if (!session || !text) return json({ error: "session/text required" }, 400);

    this.sendTo(this.agent.ws, { type: "send", session, text });
    // Broadcast once to every client (including sender) so all tabs see it.
    this.broadcast({ type: "input_echo", session, content: text });
    return json({ ok: true });
  }

  handleApproval(session: string, decision: string) {
    if (!this.agent) return;
    if (!session || !decision) return;
    this.sendTo(this.agent.ws, { type: "approval", session, decision });
  }

  // ----------------------------- helpers -----------------------------------
  sendTo(ws: WebSocket, obj: unknown) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
  broadcast(obj: unknown) {
    const data = JSON.stringify(obj);
    for (const c of this.clients.values()) {
      try { c.ws.send(data); } catch {}
    }
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
