import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "./runtime-api.js";
import type { ResolvedCollabAccount } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const collabStatus: any = createComputedAccountStatusAdapter<ResolvedCollabAccount>({
  defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
  buildChannelSummary: ({ snapshot }) => ({
    baseUrl: snapshot.baseUrl ?? "[missing]",
  }),
  resolveAccountSnapshot: ({ account }) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    extra: {
      baseUrl: account.baseUrl || "[missing]",
      apiKey: account.apiKey ? "***" : "[missing]",
      botUserId: account.botUserId,
      botDisplayName: account.botDisplayName,
    },
  }),
});
