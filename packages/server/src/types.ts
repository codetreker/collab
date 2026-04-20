export interface Channel {
  id: string;
  name: string;
  topic: string;
  type?: 'channel' | 'dm';
  visibility?: 'public' | 'private';
  created_at: number;
  created_by: string;
  deleted_at?: number | null;
}

export interface User {
  id: string;
  display_name: string;
  role: 'admin' | 'member' | 'agent';
  avatar_url: string | null;
  api_key: string | null;
  email: string | null;
  password_hash: string | null;
  last_seen_at: number | null;
  require_mention: boolean;
  created_at: number;
}

export interface Message {
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
}

export type EventKind =
  | 'message'
  | 'message_edited'
  | 'message_deleted'
  | 'mention'
  | 'channel_created'
  | 'channel_deleted'
  | 'member_joined'
  | 'member_left'
  | 'visibility_changed'
  | 'user_joined'
  | 'user_left';

export interface EventRow {
  cursor: number;
  kind: EventKind;
  channel_id: string;
  payload: string;
  created_at: number;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  joined_at: number;
  last_read_at: number | null;
}

export interface Mention {
  id: string;
  message_id: string;
  user_id: string;
  channel_id: string;
}
