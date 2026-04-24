import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const CollabAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    botUserId: z.string().optional(),
    botDisplayName: z.string().optional(),
    pollTimeoutMs: z.number().int().min(1000).max(60_000).optional(),
    transport: z.enum(["auto", "sse", "poll"]).optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.string().optional(),
  })
  .strict();

export const CollabConfigSchema = CollabAccountConfigSchema.extend({
  accounts: z.record(z.string(), CollabAccountConfigSchema.partial()).optional(),
  defaultAccount: z.string().optional(),
}).strict();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const collabPluginConfigSchema: any = buildChannelConfigSchema(CollabConfigSchema);
