type EventHandler = (event: string, data: unknown) => void | Promise<void>;
type RequestHandler = (data: unknown) => Promise<unknown>;

interface WsMessage {
  type: string;
  id?: string;
  event?: string;
  data?: unknown;
  error?: string;
}

interface PendingApiCall {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const STABLE_THRESHOLD_MS = 30_000;
const API_CALL_TIMEOUT_MS = 30_000;

export class PluginWsClient {
  private ws: WebSocket | null = null;
  private pendingApiCalls = new Map<string, PendingApiCall>();
  private eventHandlers: EventHandler[] = [];
  private requestHandler: RequestHandler | null = null;
  private attempt = 0;
  private connectedAt = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private apiCallCounter = 0;

  private serverUrl: string;
  private apiKey: string;
  private abortSignal?: AbortSignal;

  constructor(params: {
    serverUrl: string;
    apiKey: string;
    signal?: AbortSignal;
  }) {
    this.serverUrl = params.serverUrl;
    this.apiKey = params.apiKey;
    this.abortSignal = params.signal;

    if (params.signal) {
      params.signal.addEventListener("abort", () => this.close(), { once: true });
    }
  }

  get connected(): boolean {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  connect(): void {
    if (this.closed) return;
    if (this.abortSignal?.aborted) return;

    const base = this.serverUrl.replace(/\/$/, "");
    const wsBase = base.replace(/^http/, "ws");
    const url = `${wsBase}/ws/plugin`;

    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    } as unknown as string[]);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.connectedAt = Date.now();
      this.attempt = 0;
      console.log("[collab-plugin] WS connected");
    });

    ws.addEventListener("message", (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
      this.handleMessage(raw);
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.rejectAllPending();
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // close event will follow
    });
  }

  private handleMessage(raw: string): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw) as WsMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "event":
        if (msg.event) {
          for (const handler of this.eventHandlers) {
            try {
              void handler(msg.event, msg.data);
            } catch { /* ignore */ }
          }
        }
        break;

      case "request":
        if (msg.id && this.requestHandler) {
          void this.requestHandler(msg.data)
            .then((result) => {
              this.send({ type: "response", id: msg.id, data: result });
            })
            .catch((err: Error) => {
              this.send({ type: "response", id: msg.id, error: err.message });
            });
        }
        break;

      case "api_response":
        if (msg.id) {
          const pending = this.pendingApiCalls.get(msg.id);
          if (pending) {
            this.pendingApiCalls.delete(msg.id);
            clearTimeout(pending.timer);
            if (msg.error) {
              pending.reject(new Error(msg.error));
            } else {
              pending.resolve(msg.data);
            }
          }
        }
        break;

      case "pong":
        break;
    }
  }

  async apiCall(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    if (!this.connected) {
      throw new Error("WS not connected");
    }

    const id = `api_${++this.apiCallCounter}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingApiCalls.delete(id);
        reject(new Error(`API call ${id} timed out`));
      }, API_CALL_TIMEOUT_MS);

      this.pendingApiCalls.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });

      this.send({
        type: "api_request",
        id,
        data: { method, path, body },
      });
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.abortSignal?.aborted) return;

    const stable = this.connectedAt > 0 && Date.now() - this.connectedAt >= STABLE_THRESHOLD_MS;
    if (stable) this.attempt = 0;
    else this.attempt++;

    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, this.attempt - 1), BACKOFF_MAX_MS);
    console.log(`[collab-plugin] WS reconnecting in ${delay}ms (attempt ${this.attempt})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private rejectAllPending(): void {
    for (const [id, pending] of this.pendingApiCalls) {
      this.pendingApiCalls.delete(id);
      clearTimeout(pending.timer);
      pending.reject(new Error("WS disconnected"));
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.rejectAllPending();
  }
}
