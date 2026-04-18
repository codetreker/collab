import { pollCollabEvents } from "./api-client.js";
import { handleCollabInbound } from "./inbound.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import type { CollabEvent, CoreConfig, ResolvedCollabAccount } from "./types.js";

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

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

  ctx.setStatus({
    accountId: account.accountId,
    running: true,
    configured: true,
    enabled: account.enabled,
    baseUrl: account.baseUrl,
  });

  let cursor = 0;
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
          };
          try {
            payload = JSON.parse(event.payload);
          } catch {
            continue;
          }

          // Skip messages sent by the bot itself to avoid loops
          if (payload.sender_id === account.botUserId) continue;

          await handleCollabInbound({
            channelId,
            channelLabel,
            account,
            config: ctx.cfg as CoreConfig,
            event,
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
