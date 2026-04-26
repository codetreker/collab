import type { PluginWsClient } from "./ws-client.js";
import type { ResolvedBorgeeAccount } from "./types.js";

export function getWsClient(account: ResolvedBorgeeAccount): PluginWsClient | undefined {
  const client = (account as Record<string, unknown>).__wsClient as PluginWsClient | undefined;
  if (client && client.connected) return client;
  return undefined;
}
