import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ClientRequest } from "node:http";
import { handleCollabInbound } from "./inbound.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import { persistCursor } from "./cursor-store.js";
import type { CollabEvent, CoreConfig, ResolvedCollabAccount } from "./types.js";

// ─── SSE frame parser ───────────────────────────────────

interface SSEFrame {
  id?: string;
  event?: string;
  data: string;
}

class SSEParser {
  private buffer = "";
  private currentId: string | undefined;
  private currentEvent: string | undefined;
  private currentData: string[] = [];

  feed(chunk: string, emit: (frame: SSEFrame) => void): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.findLineEnd()) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + (this.buffer[idx] === "\r" ? 2 : 1));
      this.handleLine(line, emit);
    }
  }

  private findLineEnd(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === "\n") return i;
      if (c === "\r" && this.buffer[i + 1] === "\n") return i;
    }
    return -1;
  }

  private handleLine(line: string, emit: (frame: SSEFrame) => void): void {
    if (line === "") {
      if (this.currentData.length > 0 || this.currentEvent || this.currentId) {
        emit({
          id: this.currentId,
          event: this.currentEvent,
          data: this.currentData.join("\n"),
        });
      }
      this.currentEvent = undefined;
      this.currentData = [];
      return;
    }
    if (line.startsWith(":")) {
      // comment / heartbeat — caller sees via raw byte observation upstream
      return;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "id":
        this.currentId = value;
        break;
      case "event":
        this.currentEvent = value;
        break;
      case "data":
        this.currentData.push(value);
        break;
      default:
        break;
    }
  }
}

// ─── SSE client ─────────────────────────────────────────

export interface SSEClientEvents {
  onOpen?: () => void;
  onMessage: (event: CollabEvent) => void | Promise<void>;
  onHeartbeat?: () => void;
  onError: (err: { status?: number; message: string; fatal: boolean }) => void;
  onClose?: () => void;
}

export interface SSEConnection {
  close: () => void;
}

export function connectSSE(params: {
  baseUrl: string;
  apiKey: string;
  lastEventId?: number;
  signal?: AbortSignal;
  handlers: SSEClientEvents;
}): SSEConnection {
  const url = new URL("/api/v1/stream", params.baseUrl.endsWith("/") ? params.baseUrl : params.baseUrl + "/");
  const client = url.protocol === "https:" ? https : http;

  const headers: Record<string, string> = {
    authorization: `Bearer ${params.apiKey}`,
    accept: "text/event-stream",
    "cache-control": "no-cache",
  };
  if (params.lastEventId != null && params.lastEventId > 0) {
    headers["last-event-id"] = String(params.lastEventId);
  }

  let closed = false;
  let req: ClientRequest | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    try {
      req?.destroy();
    } catch {
      /* ignore */
    }
    params.handlers.onClose?.();
  };

  const onAbort = (): void => {
    close();
  };
  if (params.signal) {
    if (params.signal.aborted) {
      queueMicrotask(onAbort);
      return { close };
    }
    params.signal.addEventListener("abort", onAbort, { once: true });
  }

  req = client.request(
    url,
    {
      method: "GET",
      headers,
    },
    (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        const fatal = status === 401 || status === 403;
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          body += c;
          if (body.length > 1024) body = body.slice(0, 1024);
        });
        res.on("end", () => {
          params.handlers.onError({
            status,
            message: `SSE HTTP ${status}: ${body || "(no body)"}`,
            fatal,
          });
          close();
        });
        return;
      }

      params.handlers.onOpen?.();
      res.setEncoding("utf8");

      const parser = new SSEParser();

      res.on("data", (chunk: string) => {
        // Any byte arrival (including :heartbeat comment) counts as liveness
        params.handlers.onHeartbeat?.();
        parser.feed(chunk, (frame) => {
          const kind = frame.event ?? "message";
          if (kind === "heartbeat") return;
          const cursor = frame.id ? parseInt(frame.id, 10) : NaN;
          if (!Number.isFinite(cursor)) return;
          let payloadStr = frame.data;
          if (!payloadStr) return;
          const channelIdMatch = payloadStr.match(/"channel_id"\s*:\s*"([^"]+)"/);
          const event: CollabEvent = {
            cursor,
            kind: kind as CollabEvent["kind"],
            channel_id: channelIdMatch?.[1] ?? "",
            payload: payloadStr,
            created_at: Date.now(),
          };
          void params.handlers.onMessage(event);
        });
      });

      res.on("end", () => {
        params.handlers.onError({
          message: "SSE stream ended by server",
          fatal: false,
        });
        close();
      });

      res.on("error", (err) => {
        params.handlers.onError({
          message: `SSE stream error: ${err.message}`,
          fatal: false,
        });
        close();
      });
    },
  );

  req.on("error", (err) => {
    if (closed) return;
    params.handlers.onError({
      message: `SSE connect error: ${err.message}`,
      fatal: false,
    });
    close();
  });

  req.end();

  return { close };
}

// ─── Inbound dispatch (same filtering as poll gateway) ────

export async function dispatchSSEEvent(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedCollabAccount;
  config: CoreConfig;
  event: CollabEvent;
}): Promise<void> {
  const { account, event } = params;

  if (event.kind !== "message") return;

  let payload: {
    id: string;
    channel_id: string;
    sender_id: string;
    sender_name?: string;
    content: string;
    content_type: string;
    created_at: number;
    mentions?: string[];
    reply_to_id?: string | null;
    channel_type?: string;
  };
  try {
    payload = JSON.parse(event.payload);
  } catch {
    return;
  }

  if (payload.sender_id === account.botUserId) return;

  const isDmChannel = payload.channel_type === "dm";

  if (!isDmChannel && account.requireMention) {
    const mentions: string[] = payload.mentions ?? [];
    if (!mentions.includes(account.botUserId)) return;
  }

  await handleCollabInbound({
    channelId: params.channelId,
    channelLabel: params.channelLabel,
    account: params.account,
    config: params.config,
    event,
    channelType: isDmChannel ? "dm" : "channel",
    message: payload,
  });

  if (event.cursor > 0) {
    persistCursor(account.accountId, event.cursor);
  }
}

export async function runSSEOnce(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedCollabAccount;
  config: CoreConfig;
  ctx: ChannelGatewayContext<ResolvedCollabAccount>;
  lastEventId?: number;
}): Promise<{ reason: "closed" | "auth"; status?: number }> {
  return await new Promise((resolve) => {
    let settled = false;
    const done = (r: { reason: "closed" | "auth"; status?: number }): void => {
      if (settled) return;
      settled = true;
      conn.close();
      resolve(r);
    };

    const conn = connectSSE({
      baseUrl: params.account.baseUrl,
      apiKey: params.account.apiKey,
      lastEventId: params.lastEventId,
      signal: params.ctx.abortSignal,
      handlers: {
        onMessage: async (event) => {
          try {
            await dispatchSSEEvent({
              channelId: params.channelId,
              channelLabel: params.channelLabel,
              account: params.account,
              config: params.config,
              event,
            });
          } catch (err) {
            console.error(
              "[collab-plugin] SSE dispatch error:",
              err instanceof Error ? err.message : err,
            );
          }
        },
        onError: (err) => {
          if (err.fatal) {
            console.error(`[collab-plugin] SSE fatal: ${err.message}`);
            done({ reason: "auth", status: err.status });
          } else {
            done({ reason: "closed", status: err.status });
          }
        },
      },
    });
  });
}
