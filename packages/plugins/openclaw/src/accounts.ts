import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type { BorgeeAccountConfig, CoreConfig, ResolvedBorgeeAccount } from "./types.js";

const DEFAULT_POLL_TIMEOUT_MS = 30_000;

const {
  listAccountIds: listBorgeeAccountIds,
  resolveDefaultAccountId: resolveDefaultBorgeeAccountId,
} = createAccountListHelpers("borgee", { normalizeAccountId });

export { listBorgeeAccountIds, resolveDefaultBorgeeAccountId };

function resolveMergedBorgeeAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): BorgeeAccountConfig {
  return resolveMergedAccountConfig<BorgeeAccountConfig>({
    channelConfig: cfg.channels?.borgee as BorgeeAccountConfig | undefined,
    accounts: cfg.channels?.borgee?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveBorgeeAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedBorgeeAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedBorgeeAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.borgee?.enabled !== false;
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
    transport: merged.transport ?? "auto",
    config: {
      ...merged,
      allowFrom: merged.allowFrom ?? ["*"],
    },
  };
}

export function listEnabledBorgeeAccounts(cfg: CoreConfig): ResolvedBorgeeAccount[] {
  return listBorgeeAccountIds(cfg)
    .map((accountId) => resolveBorgeeAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

export { DEFAULT_ACCOUNT_ID };
export type { ResolvedBorgeeAccount } from "./types.js";
