import { resolveCollabAccount } from "./accounts.js";
import { sendCollabMessage } from "./api-client.js";
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

  const { message } = await sendCollabMessage({
    baseUrl: account.baseUrl,
    apiKey: account.apiKey,
    channelId: parsed.channelId,
    content: params.text,
    replyToId: params.replyToId == null ? undefined : String(params.replyToId),
  });

  return {
    to: params.to,
    messageId: message.id,
  };
}
