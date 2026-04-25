export interface Channel {
  id: string;
  name: string;
  topic: string;
  type?: 'channel' | 'dm';
  visibility?: 'public' | 'private';
  position?: string;
  group_id?: string | null;
  created_at: number;
  created_by: string;
  deleted_at?: number | null;
}

export interface ChannelGroup {
  id: string;
  name: string;
  position: string;
  created_by: string;
  created_at: number;
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
  owner_id: string | null;
  deleted_at: number | null;
  disabled: number;
}

export interface UserPermission {
  id: number;
  user_id: string;
  permission: string;
  scope: string;
  granted_by: string | null;
  granted_at: number;
}

export interface InviteCode {
  code: string;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  used_by: string | null;
  used_at: number | null;
  note: string | null;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  content_type: 'text' | 'image' | 'command';
  reply_to_id: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
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

export interface RemoteNode {
  id: string;
  user_id: string;
  machine_name: string;
  connection_token: string;
  last_seen_at: string | null;
  created_at: string;
}

export interface RemoteBinding {
  id: string;
  node_id: string;
  channel_id: string;
  path: string;
  label: string | null;
  created_at: string;
}

export interface CommandMessageContent {
  command: string;
  params: Array<{ name: string; value: string }>;
}

export interface WorkspaceFile {
  id: string;
  user_id: string;
  channel_id: string;
  parent_id: string | null;
  name: string;
  is_directory: number;
  mime_type: string | null;
  size_bytes: number;
  source: 'upload' | 'message_attachment';
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentCommand {
  name: string;
  description: string;
  usage: string;
  params: Array<{ name: string; type: string; required?: boolean; placeholder?: string }>;
}
