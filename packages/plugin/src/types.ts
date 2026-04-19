// ─── Plugin Config Types ─────────────────────────────────

export type CollabAccountConfig = {
  name?: string;
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  botUserId?: string;
  botDisplayName?: string;
  pollTimeoutMs?: number;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
};

export type CollabChannelConfig = CollabAccountConfig & {
  accounts?: Record<string, Partial<CollabAccountConfig>>;
  defaultAccount?: string;
};

export type CoreConfig = {
  channels?: {
    collab?: CollabChannelConfig;
  };
  session?: {
    store?: string;
  };
};

export type ResolvedCollabAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  baseUrl: string;
  apiKey: string;
  botUserId: string;
  botDisplayName: string;
  requireMention: boolean;
  pollTimeoutMs: number;
  config: CollabAccountConfig;
};

// ─── Collab Server API Types ─────────────────────────────

export type CollabChannel = {
  id: string;
  name: string;
  topic: string;
  created_at: number;
  member_count?: number;
};

export type CollabUser = {
  id: string;
  display_name: string;
  role: 'admin' | 'member' | 'agent';
  avatar_url: string | null;
  require_mention?: boolean;
};

export type CollabMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  content_type: 'text' | 'image';
  reply_to_id: string | null;
  created_at: number;
  edited_at: number | null;
  mentions?: string[];
};

export type CollabEventKind =
  | 'message'
  | 'message_edited'
  | 'message_deleted'
  | 'mention'
  | 'channel_created'
  | 'member_joined'
  | 'member_left';

export type CollabEvent = {
  cursor: number;
  kind: CollabEventKind;
  channel_id: string;
  payload: string;
  created_at: number;
};

export type CollabPollResult = {
  cursor: number;
  events: CollabEvent[];
};
