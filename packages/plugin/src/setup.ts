import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import type { CoreConfig } from "./types.js";

export function applyCollabSetup(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: Record<string, unknown>;
}): OpenClawConfig {
  const nextCfg = structuredClone(params.cfg) as CoreConfig;
  const section = nextCfg.channels?.collab ?? {};
  const accounts = { ...section.accounts };
  const target =
    params.accountId === DEFAULT_ACCOUNT_ID ? { ...section } : { ...accounts[params.accountId] };

  if (typeof params.input.baseUrl === "string") {
    target.baseUrl = params.input.baseUrl;
  }
  if (typeof params.input.apiKey === "string") {
    target.apiKey = params.input.apiKey;
  }
  if (typeof params.input.botUserId === "string") {
    target.botUserId = params.input.botUserId;
  }
  if (typeof params.input.botDisplayName === "string") {
    target.botDisplayName = params.input.botDisplayName;
  }

  nextCfg.channels ??= {};
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    nextCfg.channels.collab = { ...section, ...target };
  } else {
    accounts[params.accountId] = target;
    nextCfg.channels.collab = { ...section, accounts };
  }

  return nextCfg as OpenClawConfig;
}
