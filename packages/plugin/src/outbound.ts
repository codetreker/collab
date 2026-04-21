import { resolveCollabAccount } from "./accounts.js";
import { sendCollabMessage, createOrGetCollabDm, addCollabReaction, removeCollabReaction } from "./api-client.js";
import { parseCollabTarget } from "./inbound.js";
import type { CoreConfig } from "./types.js";

export async function sendCollabText(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  to: string;
  text: string;
  replyToId?: string | number | null;
}): Promise<{ to: string; messageId: string }> {
  const account = resolveCollabAccount({ cfg: params.cfg, accountId: params.accountId });
  const parsed = parseCollabTarget(params.to);

  let channelId = parsed.channelId;

  if (parsed.chatType === 'dm' && parsed.userId) {
    const { channel } = await createOrGetCollabDm({
      baseUrl: account.baseUrl,
      apiKey: account.apiKey,
      userId: parsed.userId,
    });
    channelId = channel.id;
  }

  const { message } = await sendCollabMessage({
    baseUrl: account.baseUrl,
    apiKey: account.apiKey,
    channelId,
    content: params.text,
    replyToId: params.replyToId == null ? undefined : String(params.replyToId),
  });

  return {
    to: params.to,
    messageId: message.id,
  };
}

export async function handleCollabReaction(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  type: "add_reaction" | "remove_reaction";
  messageId: string;
  emoji: string;
}): Promise<void> {
  const account = resolveCollabAccount({ cfg: params.cfg, accountId: params.accountId });
  const fn = params.type === "add_reaction" ? addCollabReaction : removeCollabReaction;
  await fn({
    baseUrl: account.baseUrl,
    apiKey: account.apiKey,
    messageId: params.messageId,
    emoji: params.emoji,
  });
}
