// ─── Shared types (mirrors server types) ────────────────

export interface Channel {
  id: string;
  name: string;
  topic: string;
  created_at: number;
  created_by: string;
  member_count?: number;
  last_message_at?: number | null;
  unread_count?: number;
}

export interface User {
  id: string;
  display_name: string;
  role: 'admin' | 'member' | 'agent';
  avatar_url: string | null;
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

export type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
