import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fetchBotIdentity, pollCollabEvents } from "./api-client.js";
import { handleCollabInbound } from "./inbound.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import type { CollabEvent, CoreConfig, ResolvedCollabAccount } from "./types.js";

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

// ─── Cursor persistence ──────────────────────────────────

function cursorFilePath(accountId: string): string {
  // Store under OpenClaw data dir; fall back to cwd
  const base = process.env.OPENCLAW_DATA_DIR || process.env.HOME || ".";
  return join(base, "data", `collab-cursor-${accountId}.json`);
}

function readPersistedCursor(accountId: string): number {
  const fp = cursorFilePath(accountId);
  try {
    if (existsSync(fp)) {
      const raw = readFileSync(fp, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.cursor === "number" && parsed.cursor > 0) {
        return parsed.cursor;
      }
    }
  } catch {
    // Corrupt or unreadable — fall through to default
  }
  // No persisted cursor: use current timestamp (seconds) so we don't replay history
  return Math.floor(Date.now() / 1000);
}

function persistCursor(accountId: string, cursor: number): void {
  const fp = cursorFilePath(accountId);
  try {
    const dir = dirname(fp);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fp, JSON.stringify({ cursor, updatedAt: Date.now() }), "utf-8");
  } catch {
    // Best-effort — don't crash the gateway over a write failure
  }
}

// ─── Gateway ─────────────────────────────────────────────

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function startCollabGateway(
  channelId: string,
  channelLabel: string,
  ctx: ChannelGatewayContext<ResolvedCollabAccount>,
): Promise<void> {
  const account = ctx.account;
  if (!account.configured) {
    throw new Error(`Collab channel is not configured for account "${account.accountId}"`);
  }

  // Auto-fetch bot identity from server unless explicitly overridden in config
  if (!account.config.botUserId || !account.config.botDisplayName) {
    try {
      const identity = await fetchBotIdentity({
        baseUrl: account.baseUrl,
        apiKey: account.apiKey,
      });
      if (!account.config.botUserId) {
        account.botUserId = identity.userId;
      }
      if (!account.config.botDisplayName) {
        account.botDisplayName = identity.displayName;
      }
      account.requireMention = identity.requireMention;
      console.log(
        `[collab-plugin] Bot identity: ${account.botDisplayName} (${account.botUserId})`,
      );
    } catch (error) {
      throw new Error(
        `[collab-plugin] Failed to fetch bot identity from ${account.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  ctx.setStatus({
    accountId: account.accountId,
    running: true,
    configured: true,
    enabled: account.enabled,
    baseUrl: account.baseUrl,
  });

  let cursor = readPersistedCursor(account.accountId);
  let consecutiveErrors = 0;

  try {
    while (!ctx.abortSignal.aborted) {
      try {
        const result = await pollCollabEvents({
          baseUrl: account.baseUrl,
          apiKey: account.apiKey,
          cursor,
          timeoutMs: account.pollTimeoutMs,
          signal: ctx.abortSignal,
        });

        cursor = result.cursor;
        persistCursor(account.accountId, cursor);
        consecutiveErrors = 0;

        for (const event of result.events) {
          // Only process new message events — skip edits/deletes/etc for now
          if (event.kind !== "message") continue;

          // Parse the payload
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
            continue;
          }

          // Skip messages sent by the bot itself to avoid loops
          if (payload.sender_id === account.botUserId) continue;

          const isDmChannel = payload.channel_type === 'dm';

          // requireMention filtering: skip messages not mentioning this bot (DMs always pass)
          if (!isDmChannel && account.requireMention) {
            const mentions: string[] = payload.mentions ?? [];
            if (!mentions.includes(account.botUserId)) {
              continue;
            }
          }

          await handleCollabInbound({
            channelId,
            channelLabel,
            account,
            config: ctx.cfg as CoreConfig,
            event,
            channelType: isDmChannel ? 'dm' : 'channel',
            message: payload,
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;

        consecutiveErrors++;
        const backoff = Math.min(RETRY_BASE_MS * Math.pow(2, consecutiveErrors - 1), RETRY_MAX_MS);
        console.error(
          `[collab-plugin] Poll error (retry #${consecutiveErrors} in ${backoff}ms):`,
          error instanceof Error ? error.message : error,
        );
        await sleep(backoff, ctx.abortSignal);
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      throw error;
    }
  }

  ctx.setStatus({
    accountId: account.accountId,
    running: false,
  });
}
