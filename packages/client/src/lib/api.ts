// ─── REST API client ─────────────────────────────────────

import type { Channel, ChannelGroup, Message, User, DmChannel, WorkspaceFile } from '../types';

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

export async function fetchChannels(): Promise<{ channels: Channel[]; groups: ChannelGroup[] }> {
  return request<{ channels: Channel[]; groups: ChannelGroup[] }>('/api/v1/channels');
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

export async function reorderChannel(channelId: string, afterId: string | null, groupId?: string | null): Promise<void> {
  const body: Record<string, unknown> = { channel_id: channelId, after_id: afterId };
  if (groupId !== undefined) body.group_id = groupId;
  await request<{ ok: boolean }>(`/api/v1/channels/reorder`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ─── Channel Groups ────────────────────────────────────

export async function createChannelGroup(name: string): Promise<ChannelGroup> {
  const data = await request<{ group: ChannelGroup }>('/api/v1/channel-groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.group;
}

export async function updateChannelGroup(groupId: string, name: string): Promise<ChannelGroup> {
  const data = await request<{ group: ChannelGroup }>(`/api/v1/channel-groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  return data.group;
}

export async function deleteChannelGroup(groupId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/channel-groups/${groupId}`, {
    method: 'DELETE',
  });
}

export async function reorderChannelGroup(groupId: string, afterId: string | null): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/channel-groups/reorder', {
    method: 'PUT',
    body: JSON.stringify({ group_id: groupId, after_id: afterId }),
  });
}

// ─── Channel Members ────────────────────────────────────

export interface ChannelMember {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url?: string | null;
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

export async function fetchMe(): Promise<User> {
  const data = await request<{ user: User }>('/api/v1/users/me');
  return data.user;
}

export async function getChannel(channelId: string): Promise<{ channel: Channel }> {
  return request<{ channel: Channel }>(`/api/v1/channels/${channelId}`);
}

export async function updateProfile(data: { display_name?: string }): Promise<User> {
  const res = await request<{ user: User }>('/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.user;
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

export async function createAgent(displayName: string, permissions?: string[], id?: string): Promise<Agent> {
  const data = await request<{ agent: Agent }>('/api/v1/agents', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, permissions, ...(id ? { id } : {}) }),
  });
  return data.agent;
}

export async function fetchAgent(id: string): Promise<Agent> {
  const data = await request<{ agent: Agent }>(`/api/v1/agents/${id}`);
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

// ─── Remote Nodes ─────────────────────────────────────

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
  machine_name?: string;
  node_user_id?: string;
}

export interface RemoteDirEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export async function fetchRemoteNodes(): Promise<RemoteNode[]> {
  const data = await request<{ nodes: RemoteNode[] }>('/api/v1/remote/nodes');
  return data.nodes;
}

export async function createRemoteNode(machineName: string): Promise<RemoteNode> {
  const data = await request<{ node: RemoteNode }>('/api/v1/remote/nodes', {
    method: 'POST',
    body: JSON.stringify({ machine_name: machineName }),
  });
  return data.node;
}

export async function deleteRemoteNode(nodeId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/remote/nodes/${nodeId}`, {
    method: 'DELETE',
  });
}

export async function fetchRemoteBindings(nodeId: string): Promise<RemoteBinding[]> {
  const data = await request<{ bindings: RemoteBinding[] }>(`/api/v1/remote/nodes/${nodeId}/bindings`);
  return data.bindings;
}

export async function createRemoteBinding(
  nodeId: string,
  channelId: string,
  path: string,
  label?: string,
): Promise<RemoteBinding> {
  const data = await request<{ binding: RemoteBinding }>(`/api/v1/remote/nodes/${nodeId}/bindings`, {
    method: 'POST',
    body: JSON.stringify({ channel_id: channelId, path, label }),
  });
  return data.binding;
}

export async function deleteRemoteBinding(nodeId: string, bindingId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/remote/nodes/${nodeId}/bindings/${bindingId}`, {
    method: 'DELETE',
  });
}

export async function fetchChannelRemoteBindings(channelId: string): Promise<RemoteBinding[]> {
  const data = await request<{ bindings: RemoteBinding[] }>(`/api/v1/channels/${channelId}/remote-bindings`);
  return data.bindings;
}

export async function remoteLs(nodeId: string, path: string): Promise<{ entries: RemoteDirEntry[] }> {
  return request<{ entries: RemoteDirEntry[] }>(`/api/v1/remote/nodes/${nodeId}/ls?path=${encodeURIComponent(path)}`);
}

export async function remoteReadFile(nodeId: string, path: string): Promise<{ content: string; mimeType: string; size: number }> {
  return request<{ content: string; mimeType: string; size: number }>(`/api/v1/remote/nodes/${nodeId}/read?path=${encodeURIComponent(path)}`);
}

export async function fetchRemoteNodeStatus(nodeId: string): Promise<{ online: boolean }> {
  return request<{ online: boolean }>(`/api/v1/remote/nodes/${nodeId}/status`);
}

// ─── Commands ──────────────────────────────────────────

export interface AgentCommandInfo {
  agent_id: string;
  agent_name: string;
  commands: Array<{
    name: string;
    description: string;
    usage: string;
    params: Array<{ name: string; type: string; required?: boolean; placeholder?: string }>;
  }>;
}

export interface CommandsResponse {
  builtin: Array<{ name: string; description: string; usage: string }>;
  agent: AgentCommandInfo[];
}

export async function listCommands(channelId?: string): Promise<CommandsResponse> {
  const params = new URLSearchParams();
  if (channelId) params.set('channelId', channelId);
  const qs = params.toString();
  return request<CommandsResponse>(`/api/v1/commands${qs ? `?${qs}` : ''}`);
}
