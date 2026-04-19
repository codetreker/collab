import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import { sendCollabMessage } from "./api-client.js";
import { getCollabRuntime } from "./runtime.js";
import type { CollabEvent, CoreConfig, ResolvedCollabAccount } from "./types.js";

/**
 * Target format for Collab:
 *   channel:<channel_id>
 *
 * Note: the SDK's routing layer prepends `channel:` from peer.kind when
 * building session keys.  We must pass the *raw* UUID as `peer.id` so the
 * key becomes `agent:<id>:collab:channel:<uuid>` — not the double-prefixed
 * `agent:<id>:collab:channel:channel:<uuid>`.
 */
function buildCollabTarget(channelId: string): string {
  return `channel:${stripChannelPrefix(channelId)}`;
}

/**
 * Strip leading "channel:" prefix if present so we never double-prefix.
 */
function stripChannelPrefix(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("channel:") ? trimmed.slice("channel:".length) : trimmed;
}

export function parseCollabTarget(raw: string): {
  chatType: "channel" | "dm";
  channelId: string;
  userId?: string;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("dm:")) {
    const value = trimmed.slice("dm:".length);
    return { chatType: "dm", channelId: value, userId: value };
  }
  if (trimmed.startsWith("channel:")) {
    return { chatType: "channel", channelId: trimmed.slice("channel:".length) };
  }
  return { chatType: "channel", channelId: trimmed };
}

export async function handleCollabInbound(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedCollabAccount;
  config: CoreConfig;
  event: CollabEvent;
  channelType?: 'channel' | 'dm';
  message: {
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
}): Promise<void> {
  const runtime = getCollabRuntime();
  const msg = params.message;
  const rawChannelId = stripChannelPrefix(msg.channel_id);
  const isDm = params.channelType === 'dm';
  const target = isDm ? `dm:${rawChannelId}` : buildCollabTarget(rawChannelId);

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: params.config as OpenClawConfig,
    channel: params.channelId,
    accountId: params.account.accountId,
    peer: {
      kind: isDm ? "direct" : "channel",
      id: rawChannelId,
    },
  });

  const storePath = runtime.channel.session.resolveStorePath(params.config.session?.store, {
    agentId: route.agentId,
  });

  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  // Format @mentions for the agent envelope
  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: params.channelLabel,
    from: msg.sender_name || msg.sender_id,
    timestamp: msg.created_at,
    previousTimestamp,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(params.config as OpenClawConfig),
    body: msg.content,
  });

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: msg.content,
    RawBody: msg.content,
    CommandBody: msg.content,
    From: buildCollabTarget(stripChannelPrefix(msg.sender_id)),
    To: target,
    SessionKey: route.sessionKey,
    AccountId: route.accountId ?? params.account.accountId,
    ChatType: isDm ? "direct" : "group",
    ConversationLabel: msg.channel_id,
    GroupSubject: msg.channel_id,
    GroupChannel: msg.channel_id,
    NativeChannelId: msg.channel_id,
    SenderName: msg.sender_name,
    SenderId: msg.sender_id,
    Provider: params.channelId,
    Surface: params.channelId,
    MessageSid: msg.id,
    MessageSidFull: msg.id,
    ReplyToId: msg.reply_to_id ?? undefined,
    Timestamp: msg.created_at,
    OriginatingChannel: params.channelId,
    OriginatingTo: target,
    CommandAuthorized: true,
  });

  await dispatchInboundReplyWithBase({
    cfg: params.config as OpenClawConfig,
    channel: params.channelId,
    accountId: params.account.accountId,
    route,
    storePath,
    ctxPayload,
    core: runtime,
    deliver: async (payload) => {
      const text =
        payload && typeof payload === "object" && "text" in payload
          ? ((payload as { text?: string }).text ?? "")
          : "";
      if (!text.trim()) return;

      await sendCollabMessage({
        baseUrl: params.account.baseUrl,
        apiKey: params.account.apiKey,
        channelId: msg.channel_id,
        content: text,
        replyToId: msg.id,
      });
    },
    onRecordError: (error) => {
      throw error instanceof Error
        ? error
        : new Error(`collab session record failed: ${String(error)}`);
    },
    onDispatchError: (error) => {
      throw error instanceof Error
        ? error
        : new Error(`collab dispatch failed: ${String(error)}`);
    },
  });
}
