import http from "node:http";
import https from "node:https";
import type {
  CollabChannel,
  CollabEvent,
  CollabMessage,
  CollabPollResult,
  CollabUser,
} from "./types.js";

// ─── HTTP helpers ────────────────────────────────────────

function buildUrl(baseUrl: string, path: string): URL {
  const normalised = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalised);
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  body: unknown | undefined,
  apiKey: string,
  signal?: AbortSignal,
): Promise<T> {
  const url = buildUrl(baseUrl, path);
  const payload = body != null ? JSON.stringify(body) : undefined;
  const client = url.protocol === "https:" ? https : http;

  return await new Promise<T>((resolve, reject) => {
    const abortErr = () =>
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    if (signal?.aborted) {
      reject(abortErr());
      return;
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      connection: "close",
    };
    if (payload != null) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }

    const req = client.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: T | { error?: string };
        try {
          parsed = text ? (JSON.parse(text) as T | { error?: string }) : ({} as T);
        } catch (e) {
          reject(e);
          return;
        }
        if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
          const errMsg =
            typeof parsed === "object" && parsed && "error" in parsed
              ? (parsed as { error: string }).error
              : undefined;
          reject(new Error(errMsg || `Collab API ${method} ${path} failed: ${res.statusCode ?? 500}`));
          return;
        }
        resolve(parsed as T);
      });
      res.on("error", reject);
    });

    const onAbort = () => req.destroy(abortErr());
    signal?.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    req.on("close", () => signal?.removeEventListener("abort", onAbort));
    if (payload != null) req.end(payload);
    else req.end();
  });
}

// ─── Collab Server API Client ────────────────────────────

export class CollabApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  // ── Poll (long-polling for events) ──

  async poll(
    cursor: number,
    timeoutMs: number,
    channelIds?: string[],
    signal?: AbortSignal,
  ): Promise<CollabPollResult> {
    return await request<CollabPollResult>(
      this.baseUrl,
      "POST",
      "/api/v1/poll",
      {
        api_key: this.apiKey,
        cursor,
        timeout_ms: timeoutMs,
        channel_ids: channelIds,
      },
      this.apiKey,
      signal,
    );
  }

  // ── Channels ──

  async listChannels(): Promise<{ channels: CollabChannel[] }> {
    return await request<{ channels: CollabChannel[] }>(
      this.baseUrl,
      "GET",
      "/api/v1/channels",
      undefined,
      this.apiKey,
    );
  }

  // ── Messages ──

  async sendMessage(
    channelId: string,
    content: string,
    opts?: { contentType?: string; replyToId?: string; mentions?: string[] },
  ): Promise<{ message: CollabMessage }> {
    return await request<{ message: CollabMessage }>(
      this.baseUrl,
      "POST",
      `/api/v1/channels/${encodeURIComponent(channelId)}/messages`,
      {
        content,
        content_type: opts?.contentType ?? "text",
        reply_to_id: opts?.replyToId,
        mentions: opts?.mentions,
      },
      this.apiKey,
    );
  }

  async getMessages(
    channelId: string,
    opts?: { before?: number; after?: number; limit?: number },
  ): Promise<{ messages: CollabMessage[]; has_more: boolean }> {
    const params = new URLSearchParams();
    if (opts?.before != null) params.set("before", String(opts.before));
    if (opts?.after != null) params.set("after", String(opts.after));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const path = `/api/v1/channels/${encodeURIComponent(channelId)}/messages${qs ? `?${qs}` : ""}`;
    return await request<{ messages: CollabMessage[]; has_more: boolean }>(
      this.baseUrl,
      "GET",
      path,
      undefined,
      this.apiKey,
    );
  }

  // ── Users ──

  async listUsers(): Promise<{ users: CollabUser[] }> {
    return await request<{ users: CollabUser[] }>(
      this.baseUrl,
      "GET",
      "/api/v1/users",
      undefined,
      this.apiKey,
    );
  }

  async getMe(): Promise<{ user: CollabUser }> {
    return await request<{ user: CollabUser }>(
      this.baseUrl,
      "GET",
      "/api/v1/users/me",
      undefined,
      this.apiKey,
    );
  }
}

// ─── Standalone helpers (used by gateway/outbound without class) ──

export async function fetchBotIdentity(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<{ userId: string; displayName: string; requireMention: boolean }> {
  const result = await request<{ user: CollabUser }>(
    params.baseUrl,
    "GET",
    "/api/v1/users/me",
    undefined,
    params.apiKey,
  );
  return {
    userId: result.user.id,
    displayName: result.user.display_name,
    requireMention: !!result.user.require_mention,
  };
}

export async function pollCollabEvents(params: {
  baseUrl: string;
  apiKey: string;
  cursor: number;
  timeoutMs: number;
  channelIds?: string[];
  signal?: AbortSignal;
}): Promise<CollabPollResult> {
  return await request<CollabPollResult>(
    params.baseUrl,
    "POST",
    "/api/v1/poll",
    {
      api_key: params.apiKey,
      cursor: params.cursor,
      timeout_ms: params.timeoutMs,
      channel_ids: params.channelIds,
    },
    params.apiKey,
    params.signal,
  );
}

export async function sendCollabMessage(params: {
  baseUrl: string;
  apiKey: string;
  channelId: string;
  content: string;
  contentType?: string;
  replyToId?: string;
  mentions?: string[];
}): Promise<{ message: CollabMessage }> {
  return await request<{ message: CollabMessage }>(
    params.baseUrl,
    "POST",
    `/api/v1/channels/${encodeURIComponent(params.channelId)}/messages`,
    {
      content: params.content,
      content_type: params.contentType ?? "text",
      reply_to_id: params.replyToId,
      mentions: params.mentions,
    },
    params.apiKey,
  );
}

export async function createOrGetCollabDm(params: {
  baseUrl: string;
  apiKey: string;
  userId: string;
}): Promise<{ channel: CollabChannel; peer: CollabUser }> {
  return await request<{ channel: CollabChannel; peer: CollabUser }>(
    params.baseUrl,
    "POST",
    `/api/v1/dm/${encodeURIComponent(params.userId)}`,
    undefined,
    params.apiKey,
  );
}
