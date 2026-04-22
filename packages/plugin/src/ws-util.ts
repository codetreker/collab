import type { PluginWsClient } from "./ws-client.js";
import type { ResolvedCollabAccount } from "./types.js";

export function getWsClient(account: ResolvedCollabAccount): PluginWsClient | undefined {
  const client = (account as Record<string, unknown>).__wsClient as PluginWsClient | undefined;
  if (client && client.connected) return client;
  return undefined;
}
