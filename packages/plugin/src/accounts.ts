import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type { CollabAccountConfig, CoreConfig, ResolvedCollabAccount } from "./types.js";

const DEFAULT_POLL_TIMEOUT_MS = 30_000;

const {
  listAccountIds: listCollabAccountIds,
  resolveDefaultAccountId: resolveDefaultCollabAccountId,
} = createAccountListHelpers("collab", { normalizeAccountId });

export { listCollabAccountIds, resolveDefaultCollabAccountId };

function resolveMergedCollabAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): CollabAccountConfig {
  return resolveMergedAccountConfig<CollabAccountConfig>({
    channelConfig: cfg.channels?.collab as CollabAccountConfig | undefined,
    accounts: cfg.channels?.collab?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveCollabAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedCollabAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedCollabAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.collab?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const baseUrl = merged.baseUrl?.trim() ?? "";
  const apiKey = merged.apiKey?.trim() ?? "";
  const botUserId = merged.botUserId?.trim() || "openclaw-agent";
  const botDisplayName = merged.botDisplayName?.trim() || "OpenClaw";
  return {
    accountId,
    enabled,
    configured: Boolean(baseUrl && apiKey),
    name: normalizeOptionalString(merged.name),
    baseUrl,
    apiKey,
    botUserId,
    botDisplayName,
    requireMention: false,
    pollTimeoutMs: merged.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
    config: {
      ...merged,
      allowFrom: merged.allowFrom ?? ["*"],
    },
  };
}

export function listEnabledCollabAccounts(cfg: CoreConfig): ResolvedCollabAccount[] {
  return listCollabAccountIds(cfg)
    .map((accountId) => resolveCollabAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

export { DEFAULT_ACCOUNT_ID };
export type { ResolvedCollabAccount } from "./types.js";
