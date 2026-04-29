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
  updates: { name?: string; topic?: string; visibility?: 'public' | 'private'; archived?: boolean },
): Promise<Channel> {
  if (updates.topic !== undefined && !updates.name && !updates.visibility && updates.archived === undefined) {
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

// CHN-1.2 立场 ⑤: archive flip is server-stamped. Pass `true` to retire,
// `false` to un-archive. Server emits a system DM to channel members on the
// `false → true` transition so that everyone observes the closure.
export async function archiveChannel(channelId: string, archived: boolean): Promise<Channel> {
  return updateChannel(channelId, { archived });
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
  // CHN-1.2 立场 ⑥ (concept-model §1.4): when true, this member does not
  // auto-broadcast on lifecycle events. Default false for humans; backfilled
  // to true for agents — UI renders a "silent" badge so peers know the agent
  // listens but won't chime in unprompted.
  silent?: boolean;
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

// RT-1.2 (#290 follow): backfill the events the WS missed during a
// disconnect window. Server contract (server-go internal/api/poll.go
// handleEventsBackfill): returns ONLY events with `cursor > since`,
// scoped to the user's channel membership, in cursor-ASC order. The
// reverse约束 (RT-1 spec §1.2) is "do NOT default to full history" —
// callers MUST pass an explicit `since` (= last_seen_cursor); the
// server treats `since=0` as "give me everything you have for this
// user from cursor 1" but the client's own gating (only call after a
// dropped WS reconnect, only with a stored cursor) keeps the load
// bounded. `limit` defaults server-side to 200, max 500.
export interface BackfillEvent {
  cursor: number;
  kind: string;
  channel_id: string;
  payload: unknown;
  created_at: number;
}

export async function fetchEventsBackfill(
  since: number,
  opts?: { limit?: number },
): Promise<{ cursor: number; events: BackfillEvent[] }> {
  const params = new URLSearchParams();
  params.set('since', String(since));
  if (opts?.limit) params.set('limit', String(opts.limit));
  return request<{ cursor: number; events: BackfillEvent[] }>(
    `/api/v1/events?${params.toString()}`,
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

// AL-1a (#R3 Phase 2) — runtime 三态 + 故障原因码.
// 文案锁见 packages/client/src/lib/agent-state.ts (野马 #190 §11).
// state 字段 server 总是 emit (online/offline/error); reason 仅 error 态有.
export type AgentRuntimeState = 'online' | 'offline' | 'error';
export type AgentRuntimeReason =
  | 'api_key_invalid'
  | 'quota_exceeded'
  | 'network_unreachable'
  | 'runtime_crashed'
  | 'runtime_timeout'
  | 'unknown';

export interface Agent {
  id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  owner_id: string | null;
  created_at: number;
  api_key?: string;
  disabled?: number;
  state?: AgentRuntimeState;
  reason?: AgentRuntimeReason;
  state_updated_at?: number;
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

// ─── Agent invitations (CM-4.2) ───────────────────────
// Mirrors the hand-built sanitizer on the server (CM-4.1, see
// docs/current/server/data-model.md §Agent invitations API). `decided_at`
// and `expires_at` are omitted by the server when nil — declared optional
// here so existing pending rows decode cleanly.
export type AgentInvitationState = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AgentInvitation {
  id: string;
  channel_id: string;
  agent_id: string;
  requested_by: string;
  state: AgentInvitationState;
  created_at: number;
  decided_at?: number;
  expires_at?: number;
  // Bug-029 P0: server JOIN-resolved labels. Empty string when the lookup
  // misses (agent/channel/user removed). Client falls back to raw ID.
  agent_name?: string;
  channel_name?: string;
  requester_name?: string;
}

export type AgentInvitationListRole = 'owner' | 'requester';

export async function createAgentInvitation(
  channelId: string,
  agentId: string,
  expiresAt?: number,
): Promise<AgentInvitation> {
  const data = await request<{ invitation: AgentInvitation }>('/api/v1/agent_invitations', {
    method: 'POST',
    body: JSON.stringify({
      channel_id: channelId,
      agent_id: agentId,
      ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    }),
  });
  return data.invitation;
}

export async function listAgentInvitations(role: AgentInvitationListRole = 'owner'): Promise<AgentInvitation[]> {
  const data = await request<{ invitations: AgentInvitation[] }>(
    `/api/v1/agent_invitations?role=${role}`,
  );
  return data.invitations;
}

export async function fetchAgentInvitation(id: string): Promise<AgentInvitation> {
  const data = await request<{ invitation: AgentInvitation }>(`/api/v1/agent_invitations/${id}`);
  return data.invitation;
}

export async function decideAgentInvitation(
  id: string,
  state: 'approved' | 'rejected',
): Promise<AgentInvitation> {
  const data = await request<{ invitation: AgentInvitation }>(`/api/v1/agent_invitations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });
  return data.invitation;
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

// ─── Artifacts (CV-1.2 server / CV-1.3 client) ─────────────
//
// Spec: docs/implementation/modules/cv-1-spec.md §3 (CV-1.3 段) +
// docs/qa/acceptance-templates/cv-1.md §3 + docs/qa/cv-1-stance-checklist.md
// (7 立场) + cv-1-stance-v1-supplement.md (②③⑤⑦ v1 字段).
//
// Pull-side契约: server's PushArtifactUpdated frame is signal-only (no
// body, no committer). 当 ArtifactUpdated frame 到达 client, 必须再走
// GET /api/v1/artifacts/:id 拿 body + committer (立场 ⑤ envelope 仅信号).

/**
 * CV-3.1/3.2 (#396 / #400): artifact kind enum extended from the v1
 * 'markdown' lock to three kinds. 字面 byte-identical 跟
 * cv-3-content-lock.md §1 ① + cv_3_2_artifact_validation.go ArtifactKind*
 * 同源 (反 camelCase `imageLink` / 同义词 `pdf|kanban|mindmap` 漂移).
 */
export type ArtifactKind = 'markdown' | 'code' | 'image_link';

export interface Artifact {
  id: string;
  channel_id: string;
  /** CV-3.1: 三态 enum (was 'markdown'-only in CV-1). */
  type: ArtifactKind;
  title: string;
  body: string;
  current_version: number;
  created_at: number;
  archived_at?: number;
  /** 立场 ⑥ committer_kind 'agent'|'human' (head version 的). */
  committer_kind: 'agent' | 'human';
  committer_id: string;
  /** 立场 ② 单文档锁 30s TTL — nil = 无人持锁可写. */
  lock_holder_user_id?: string;
  lock_acquired_at?: number;
}

export interface ArtifactVersion {
  version: number;
  body: string;
  committer_kind: 'agent' | 'human';
  committer_id: string;
  created_at: number;
  /** 立场 ⑦ rollback 路径 — 非 NULL = 该 row 是 rollback 触发的新 commit. */
  rolled_back_from_version?: number;
}

export interface CommitArtifactResponse {
  artifact_id: string;
  version: number;
  committer_id: string;
  committer_kind: 'agent' | 'human';
  updated_at: number;
}

export interface RollbackArtifactResponse {
  artifact_id: string;
  version: number;
  rolled_back_from_version: number;
  updated_at: number;
}

/** Create an artifact in a channel (CV-1.2 §2.1). */
export async function createArtifact(
  channelId: string,
  payload: { title: string; body?: string },
): Promise<Artifact> {
  return request<Artifact>(`/api/v1/channels/${encodeURIComponent(channelId)}/artifacts`, {
    method: 'POST',
    body: JSON.stringify({ title: payload.title, body: payload.body ?? '' }),
  });
}

/** GET head body + committer (立场 ⑤ pull 路径). */
export async function getArtifact(artifactId: string): Promise<Artifact> {
  return request<Artifact>(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`);
}

/** GET version sidebar list (立场 ③ 线性版本号). */
export async function listArtifactVersions(
  artifactId: string,
): Promise<{ versions: ArtifactVersion[] }> {
  return request<{ versions: ArtifactVersion[] }>(
    `/api/v1/artifacts/${encodeURIComponent(artifactId)}/versions`,
  );
}

/**
 * Commit a new version. expected_version 来自 client 编辑时的 head;
 * server 端 mismatch → 409 (立场 ② lock conflict + reload hint).
 */
export async function commitArtifact(
  artifactId: string,
  payload: { expected_version: number; body: string },
): Promise<CommitArtifactResponse> {
  return request<CommitArtifactResponse>(
    `/api/v1/artifacts/${encodeURIComponent(artifactId)}/commits`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Rollback to a prior version (立场 ⑦ owner-only). 服务器侧已闸 admin →
 * 401 / 非 owner → 403 / 锁持有=别人 → 409.
 */
export async function rollbackArtifact(
  artifactId: string,
  toVersion: number,
): Promise<RollbackArtifactResponse> {
  return request<RollbackArtifactResponse>(
    `/api/v1/artifacts/${encodeURIComponent(artifactId)}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({ to_version: toVersion }),
    },
  );
}
