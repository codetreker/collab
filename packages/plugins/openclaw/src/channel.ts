import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listBorgeeAccountIds,
  resolveBorgeeAccount,
  resolveDefaultBorgeeAccountId,
} from "./accounts.js";
import { borgeePluginConfigSchema } from "./config-schema.js";
import { startBorgeeGateway } from "./gateway.js";
import { parseBorgeeTarget } from "./inbound.js";
import { sendBorgeeText } from "./outbound.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { applyBorgeeSetup } from "./setup.js";
import { borgeeStatus } from "./status.js";
import type { CoreConfig, ResolvedBorgeeAccount } from "./types.js";

const CHANNEL_ID = "borgee" as const;
const meta = { ...getChatChannelMeta(CHANNEL_ID) };

function buildBorgeeTarget(params: { channelId: string }): string {
  return `channel:${stripChannelPrefix(params.channelId)}`;
}

function stripChannelPrefix(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("channel:") ? trimmed.slice("channel:".length) : trimmed;
}

function normalizeBorgeeTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export const borgeePlugin: ChannelPlugin<ResolvedBorgeeAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["group", "direct"],
    },
    reload: { configPrefixes: ["channels.borgee"] },
    configSchema: borgeePluginConfigSchema,
    setup: {
      applyAccountConfig: ({ cfg, accountId, input }) =>
        applyBorgeeSetup({
          cfg,
          accountId,
          input: input as Record<string, unknown>,
        }),
    },
    config: {
      listAccountIds: (cfg) => listBorgeeAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveBorgeeAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultBorgeeAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveBorgeeAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveBorgeeAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo,
    },
    messaging: {
      normalizeTarget: normalizeBorgeeTarget,
      parseExplicitTarget: ({ raw }) => {
        const parsed = parseBorgeeTarget(raw);
        if (parsed.chatType === 'dm') {
          return {
            to: `dm:${parsed.userId ?? parsed.channelId}`,
            chatType: "direct",
          };
        }
        return {
          to: buildBorgeeTarget({ channelId: parsed.channelId }),
          chatType: "group",
        };
      },
      inferTargetChatType: ({ to }) => {
        return to.startsWith("dm:") ? "direct" : "group";
      },
      targetResolver: {
        looksLikeId: (raw) => /^(channel:|dm:)/i.test(raw.trim()) || raw.trim().length > 0,
        hint: "<channel:channel_id> or <dm:user_id>",
      },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target }) => {
        const parsed = parseBorgeeTarget(target);
        const isDm = parsed.chatType === 'dm';
        return buildChannelOutboundSessionRoute({
          cfg,
          agentId,
          channel: CHANNEL_ID,
          accountId,
          peer: {
            kind: isDm ? "direct" : "channel",
            id: parsed.channelId,
          },
          chatType: isDm ? "direct" : "group",
          from: `borgee:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to: isDm ? `dm:${parsed.userId ?? parsed.channelId}` : buildBorgeeTarget({ channelId: parsed.channelId }),
        });
      },
    },
    status: borgeeStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startBorgeeGateway(CHANNEL_ID, meta.label, ctx);
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
        await sendBorgeeText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
          replyToId,
        }),
    },
  },
});
