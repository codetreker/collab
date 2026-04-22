// ─── REST API client ─────────────────────────────────────

import type { Channel, Message, User, AdminUser, DmChannel, WorkspaceFile } from '../types';

const BASE = '';  // Same origin via Vite proxy in dev, or same server in prod

let currentUserId: string | null = null;

export function setDevUserId(userId: string | null): void {
  currentUserId = userId;
}

export function getDevUserId(): string | null {
  return currentUserId;
}

async function request<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> ?? {}),
  };

  if (import.meta.env.DEV && currentUserId) {
    headers['X-Dev-User-Id'] = currentUserId;
  }

  // Don't set Content-Type for FormData (browser sets boundary automatically)
  // Only set JSON content-type when there's actually a body to send
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${url}`, {
    ...opts,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth ──────────────────────────────────────────────

export async function login(email: string, password: string): Promise<User> {
  const data = await request<{ user: User }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/auth/logout', {
    method: 'POST',
  });
}

// ─── Channels ───────────────────────────────────────────

export async function fetchChannels(): Promise<Channel[]> {
  const data = await request<{ channels: Channel[] }>('/api/v1/channels');
  return data.channels;
}

export async function createChannel(
  name: string,
  topic?: string,
  memberIds?: string[],
  visibility?: 'public' | 'private',
): Promise<Channel> {
  const data = await request<{ channel: Channel }>('/api/v1/channels', {
    method: 'POST',
    body: JSON.stringify({ name, topic, member_ids: memberIds, visibility }),
  });
  return data.channel;
}

export async function updateChannel(
  channelId: string,
  updates: { name?: string; topic?: string; visibility?: 'public' | 'private' },
): Promise<Channel> {
  if (updates.topic !== undefined && !updates.name && !updates.visibility) {
    const data = await request<{ channel: Channel }>(`/api/v1/channels/${channelId}/topic`, {
      method: 'PUT',
      body: JSON.stringify({ topic: updates.topic }),
    });
    return data.channel;
  }
  const data = await request<{ channel: Channel }>(`/api/v1/channels/${channelId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.channel;
}

export async function joinChannel(channelId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/join`, {
    method: 'POST',
  });
}

export async function fetchChannelPreview(channelId: string): Promise<{ messages: Message[]; channel: Channel }> {
  return request<{ messages: Message[]; channel: Channel }>(`/api/v1/channels/${channelId}/preview`);
}

export async function leaveChannel(channelId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/leave`, {
    method: 'POST',
  });
}

export async function deleteChannel(channelId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}`, {
    method: 'DELETE',
  });
}

// ─── Channel Members ────────────────────────────────────

export interface ChannelMember {
  user_id: string;
  display_name: string;
  role: string;
  joined_at: number;
}

export async function fetchChannelMembers(channelId: string): Promise<ChannelMember[]> {
  const data = await request<{ members: ChannelMember[] }>(`/api/v1/channels/${channelId}/members`);
  return data.members;
}

export async function addChannelMember(channelId: string, userId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeChannelMember(channelId: string, userId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/members/${userId}`, {
    method: 'DELETE',
  });
}

// ─── Messages ───────────────────────────────────────────

export async function fetchMessages(
  channelId: string,
  opts?: { before?: number; after?: number; limit?: number },
): Promise<{ messages: Message[]; has_more: boolean }> {
  const params = new URLSearchParams();
  if (opts?.before) params.set('before', String(opts.before));
  if (opts?.after) params.set('after', String(opts.after));
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return request<{ messages: Message[]; has_more: boolean }>(
    `/api/v1/channels/${channelId}/messages${qs ? `?${qs}` : ''}`,
  );
}

export async function sendMessage(
  channelId: string,
  content: string,
  contentType: 'text' | 'image' = 'text',
  mentions?: string[],
): Promise<Message> {
  const data = await request<{ message: Message }>(
    `/api/v1/channels/${channelId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ content, content_type: contentType, mentions }),
    },
  );
  return data.message;
}

export async function editMessage(messageId: string, content: string): Promise<Message> {
  const data = await request<{ message: Message }>(`/api/v1/messages/${messageId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return data.message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (import.meta.env.DEV && currentUserId) {
    headers['X-Dev-User-Id'] = currentUserId;
  }
  const res = await fetch(`${BASE}/api/v1/messages/${messageId}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed');
  }
}

// ─── Users ──────────────────────────────────────────────

export async function fetchUsers(): Promise<User[]> {
  const data = await request<{ users: User[] }>('/api/v1/users');
  return data.users;
}

export async function fetchMe(): Promise<User> {
  const data = await request<{ user: User }>('/api/v1/users/me');
  return data.user;
}

// ─── Online ─────────────────────────────────────────────

export async function fetchOnlineUsers(): Promise<string[]> {
  const data = await request<{ user_ids: string[] }>('/api/v1/online');
  return data.user_ids;
}

// ─── Upload ─────────────────────────────────────────────

export async function uploadImage(file: File): Promise<{ url: string; content_type: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ url: string; content_type: string }>('/api/v1/upload', {
    method: 'POST',
    body: form,
  });
}

// ─── Channel read ───────────────────────────────────────

export async function markChannelRead(channelId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/read`, {
    method: 'PUT',
  });
}

// ─── DM ─────────────────────────────────────────────────

export async function createOrGetDm(userId: string): Promise<DmChannel> {
  const data = await request<{ channel: DmChannel['id'] extends string ? { id: string; name: string; type: 'dm'; created_at: number; created_by: string } : never; peer: DmChannel['peer'] }>(
    `/api/v1/dm/${userId}`,
    { method: 'POST' },
  );
  return {
    id: data.channel.id,
    name: data.channel.name,
    type: 'dm',
    created_at: data.channel.created_at,
    peer: data.peer,
    unread_count: 0,
    last_message: null,
  };
}

export async function fetchDmChannels(): Promise<DmChannel[]> {
  const data = await request<{ channels: DmChannel[] }>('/api/v1/dm');
  return data.channels;
}

// ─── Permissions ────────────────────────────────────────

export interface PermissionDetail {
  id: number;
  permission: string;
  scope: string;
  granted_by: string | null;
  granted_at: number;
}

export interface MyPermissionsResponse {
  user_id: string;
  role: string;
  permissions: string[];
  details: PermissionDetail[];
}

export async function fetchMyPermissions(): Promise<MyPermissionsResponse> {
  return request<MyPermissionsResponse>('/api/v1/me/permissions');
}

// ─── Admin ──────────────────────────────────────────────

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await request<{ users: AdminUser[] }>('/api/v1/admin/users');
  return data.users;
}

export async function createAdminUser(data: {
  id?: string;
  email?: string;
  password?: string;
  display_name: string;
  role: string;
}): Promise<AdminUser> {
  const res = await request<{ user: AdminUser }>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.user;
}

export async function updateAdminUser(
  id: string,
  data: { display_name?: string; password?: string; role?: string; require_mention?: boolean },
): Promise<AdminUser> {
  const res = await request<{ user: AdminUser }>(`/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.user;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export async function generateApiKey(userId: string): Promise<{ api_key: string }> {
  return request<{ api_key: string }>(`/api/v1/admin/users/${userId}/api-key`, {
    method: 'POST',
  });
}

export async function deleteApiKey(userId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/admin/users/${userId}/api-key`, {
    method: 'DELETE',
  });
}

// ─── Admin Permissions ─────────────────────────────────

export async function fetchAdminUserPermissions(userId: string): Promise<MyPermissionsResponse> {
  return request<MyPermissionsResponse>(`/api/v1/admin/users/${userId}/permissions`);
}

export async function grantAdminPermission(userId: string, permission: string, scope?: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/admin/users/${userId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ permission, scope }),
  });
}

export async function revokeAdminPermission(userId: string, permission: string, scope?: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/admin/users/${userId}/permissions`, {
    method: 'DELETE',
    body: JSON.stringify({ permission, scope }),
  });
}

export async function patchAdminUser(
  id: string,
  data: { display_name?: string; password?: string; role?: string; require_mention?: boolean; disabled?: boolean },
): Promise<AdminUser> {
  const res = await request<{ user: AdminUser }>(`/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.user;
}

// ─── Admin Invites ─────────────────────────────────────

export interface InviteCode {
  code: string;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  used_by: string | null;
  used_at: number | null;
  note: string | null;
}

export async function fetchAdminInvites(): Promise<InviteCode[]> {
  const data = await request<{ invites: InviteCode[] }>('/api/v1/admin/invites');
  return data.invites;
}

export async function createAdminInvite(expiresInHours?: number, note?: string): Promise<InviteCode> {
  const data = await request<{ invite: InviteCode }>('/api/v1/admin/invites', {
    method: 'POST',
    body: JSON.stringify({ expires_in_hours: expiresInHours, note }),
  });
  return data.invite;
}

export async function deleteAdminInvite(code: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/admin/invites/${code}`, {
    method: 'DELETE',
  });
}

// ─── Auth Register ─────────────────────────────────────

export async function register(inviteCode: string, email: string, password: string, displayName: string): Promise<User> {
  const data = await request<{ user: User }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ invite_code: inviteCode, email, password, display_name: displayName }),
  });
  return data.user;
}

// ─── Reactions ─────────────────────────────────────────

export async function addReaction(messageId: string, emoji: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/messages/${messageId}/reactions`, {
    method: 'PUT',
    body: JSON.stringify({ emoji }),
  });
}

export async function removeReaction(messageId: string, emoji: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/messages/${messageId}/reactions`, {
    method: 'DELETE',
    body: JSON.stringify({ emoji }),
  });
}

// ─── Agents ────────────────────────────────────────────

export interface Agent {
  id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  owner_id: string | null;
  created_at: number;
  api_key?: string;
  disabled?: number;
}

export async function fetchAgents(): Promise<Agent[]> {
  const data = await request<{ agents: Agent[] }>('/api/v1/agents');
  return data.agents;
}

export async function createAgent(displayName: string, permissions?: string[]): Promise<Agent> {
  const data = await request<{ agent: Agent }>('/api/v1/agents', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, permissions }),
  });
  return data.agent;
}

export async function deleteAgent(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/agents/${id}`, {
    method: 'DELETE',
  });
}

export async function rotateAgentApiKey(id: string): Promise<string> {
  const data = await request<{ api_key: string }>(`/api/v1/agents/${id}/rotate-api-key`, {
    method: 'POST',
  });
  return data.api_key;
}

export async function fetchAgentPermissions(id: string): Promise<{ permissions: string[]; details: PermissionDetail[] }> {
  return request<{ permissions: string[]; details: PermissionDetail[] }>(`/api/v1/agents/${id}/permissions`);
}

export async function updateAgentPermissions(id: string, permissions: { permission: string; scope?: string }[]): Promise<void> {
  await request<{ agent_id: string }>(`/api/v1/agents/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
}

export async function addAgentToChannel(channelId: string, agentId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channels/${channelId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: agentId }),
  });
}

// ─── Agent Files ──────────────────────────────────────────

export interface AgentFileResponse {
  content: string;
  size: number;
  mime_type: string;
  error?: undefined;
}

export async function getAgentFile(agentId: string, path: string): Promise<AgentFileResponse> {
  return request<AgentFileResponse>(`/api/v1/agents/${agentId}/files?path=${encodeURIComponent(path)}`);
}

// ─── Workspace ────────────────────────────────────────

export async function listWorkspaceFiles(channelId: string, parentId?: string): Promise<WorkspaceFile[]> {
  const qs = parentId ? `?parentId=${parentId}` : '';
  const data = await request<{ files: WorkspaceFile[] }>(`/api/v1/channels/${channelId}/workspace${qs}`);
  return data.files;
}

export async function uploadWorkspaceFile(channelId: string, file: File, parentId?: string): Promise<WorkspaceFile> {
  const form = new FormData();
  form.append('file', file);
  const qs = parentId ? `?parentId=${parentId}` : '';
  const data = await request<{ file: WorkspaceFile }>(`/api/v1/channels/${channelId}/workspace/upload${qs}`, {
    method: 'POST',
    body: form,
  });
  return data.file;
}

export async function downloadWorkspaceFile(channelId: string, fileId: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (import.meta.env.DEV && currentUserId) {
    headers['X-Dev-User-Id'] = currentUserId;
  }
  const res = await fetch(`/api/v1/channels/${channelId}/workspace/files/${fileId}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  return res;
}

export async function updateWorkspaceFile(channelId: string, fileId: string, content: string): Promise<WorkspaceFile> {
  const data = await request<{ file: WorkspaceFile }>(`/api/v1/channels/${channelId}/workspace/files/${fileId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return data.file;
}

export async function deleteWorkspaceFile(channelId: string, fileId: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (import.meta.env.DEV && currentUserId) {
    headers['X-Dev-User-Id'] = currentUserId;
  }
  const res = await fetch(`/api/v1/channels/${channelId}/workspace/files/${fileId}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, 'Delete failed');
}

export async function mkdirWorkspace(channelId: string, name: string, parentId?: string): Promise<WorkspaceFile> {
  const data = await request<{ file: WorkspaceFile }>(`/api/v1/channels/${channelId}/workspace/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
  return data.file;
}

export async function moveWorkspaceFile(channelId: string, fileId: string, parentId: string | null): Promise<WorkspaceFile> {
  const data = await request<{ file: WorkspaceFile }>(`/api/v1/channels/${channelId}/workspace/files/${fileId}/move`, {
    method: 'POST',
    body: JSON.stringify({ parentId }),
  });
  return data.file;
}

export async function renameWorkspaceFile(channelId: string, fileId: string, name: string): Promise<WorkspaceFile> {
  const data = await request<{ file: WorkspaceFile }>(`/api/v1/channels/${channelId}/workspace/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return data.file;
}

export async function fetchAllWorkspaces(): Promise<WorkspaceFile[]> {
  const data = await request<{ files: WorkspaceFile[] }>('/api/v1/workspaces');
  return data.files;
}
