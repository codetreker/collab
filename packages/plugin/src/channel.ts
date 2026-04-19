import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listCollabAccountIds,
  resolveCollabAccount,
  resolveDefaultCollabAccountId,
} from "./accounts.js";
import { collabPluginConfigSchema } from "./config-schema.js";
import { startCollabGateway } from "./gateway.js";
import { parseCollabTarget } from "./inbound.js";
import { sendCollabText } from "./outbound.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { applyCollabSetup } from "./setup.js";
import { collabStatus } from "./status.js";
import type { CoreConfig, ResolvedCollabAccount } from "./types.js";

const CHANNEL_ID = "collab" as const;
const meta = { ...getChatChannelMeta(CHANNEL_ID) };

function buildCollabTarget(params: { channelId: string }): string {
  return `channel:${stripChannelPrefix(params.channelId)}`;
}

function stripChannelPrefix(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("channel:") ? trimmed.slice("channel:".length) : trimmed;
}

function normalizeCollabTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export const collabPlugin: ChannelPlugin<ResolvedCollabAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["group"],
    },
    reload: { configPrefixes: ["channels.collab"] },
    configSchema: collabPluginConfigSchema,
    setup: {
      applyAccountConfig: ({ cfg, accountId, input }) =>
        applyCollabSetup({
          cfg,
          accountId,
          input: input as Record<string, unknown>,
        }),
    },
    config: {
      listAccountIds: (cfg) => listCollabAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveCollabAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultCollabAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveCollabAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveCollabAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo,
    },
    messaging: {
      normalizeTarget: normalizeCollabTarget,
      parseExplicitTarget: ({ raw }) => {
        const parsed = parseCollabTarget(raw);
        return {
          to: buildCollabTarget({ channelId: parsed.channelId }),
          chatType: "group",
        };
      },
      inferTargetChatType: () => "group",
      targetResolver: {
        looksLikeId: (raw) => /^channel:/i.test(raw.trim()) || raw.trim().length > 0,
        hint: "<channel:channel_id>",
      },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target }) => {
        const parsed = parseCollabTarget(target);
        return buildChannelOutboundSessionRoute({
          cfg,
          agentId,
          channel: CHANNEL_ID,
          accountId,
          peer: {
            kind: "channel",
            id: parsed.channelId,
          },
          chatType: "group",
          from: `collab:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to: buildCollabTarget({ channelId: parsed.channelId }),
        });
      },
    },
    status: collabStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startCollabGateway(CHANNEL_ID, meta.label, ctx);
      },
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
    },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ cfg, to, text, accountId, replyToId }) =>
        await sendCollabText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
          replyToId,
        }),
    },
  },
});
