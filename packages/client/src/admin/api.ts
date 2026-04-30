const BASE = '/admin-api/v1';

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new AdminApiError(res.status, body.error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export interface AdminSession {
  role: 'admin';
  username: string;
}

export interface OrgStatsRow {
  org_id: string;
  user_count: number;
  channel_count: number;
}

export interface AdminStats {
  user_count: number;
  channel_count: number;
  online_count: number;
  by_org?: OrgStatsRow[];
}

export interface AdminUser {
  id: string;
  display_name: string;
  email?: string | null;
  role: 'admin' | 'member' | 'agent';
  avatar_url?: string | null;
  require_mention?: boolean;
  owner_id?: string | null;
  disabled?: boolean;
  deleted_at?: number | null;
  last_seen_at?: number | null;
  created_at: number;
}

export interface AdminChannel {
  id: string;
  name: string;
  type: string;
  visibility: string;
  created_at: number;
  deleted_at?: number | null;
  member_count?: number;
}

export interface InviteCode {
  code: string;
  created_by: string;
  created_at: number;
  expires_at?: number | null;
  used_by?: string | null;
  used_at?: number | null;
  note?: string | null;
}

export async function adminLogin(username: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function adminLogout(): Promise<void> {
  await request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export function fetchAdminMe(): Promise<AdminSession> {
  return request<AdminSession>('/auth/me');
}

export function fetchStats(): Promise<AdminStats> {
  return request<AdminStats>('/stats');
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const data = await request<{ users: AdminUser[] }>('/users');
  return data.users;
}

export async function createUser(data: { id?: string; email: string; password: string; display_name: string }): Promise<AdminUser> {
  const res = await request<{ user: AdminUser }>('/users', {
    method: 'POST',
    body: JSON.stringify({ ...data, role: 'member' }),
  });
  return res.user;
}

export async function patchUser(id: string, data: { display_name?: string; password?: string; disabled?: boolean }): Promise<AdminUser> {
  const res = await request<{ user: AdminUser }>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.user;
}

export async function deleteUser(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchUserAgents(id: string): Promise<AdminUser[]> {
  const data = await request<{ agents: AdminUser[] }>(`/users/${encodeURIComponent(id)}/agents`);
  return data.agents;
}

export async function fetchChannels(): Promise<AdminChannel[]> {
  const data = await request<{ channels: AdminChannel[] }>('/channels');
  return data.channels;
}

export async function forceDeleteChannel(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/channels/${encodeURIComponent(id)}/force`, { method: 'DELETE' });
}

export async function fetchInvites(): Promise<InviteCode[]> {
  const data = await request<{ invites: InviteCode[] }>('/invites');
  return data.invites;
}

export async function createInvite(expiresInHours?: number, note?: string): Promise<InviteCode> {
  const data = await request<{ invite: InviteCode }>('/invites', {
    method: 'POST',
    body: JSON.stringify({ expires_in_hours: expiresInHours, note }),
  });
  return data.invite;
}

export async function deleteInvite(code: string): Promise<void> {
  await request<{ ok: boolean }>(`/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

// ADM-2.2 admin-rail audit-log endpoint (#484, blueprint admin-model.md §1.4
// 立场 ③ admin 互可见 + 三 filter UI 收敛). admin cookie 路径分叉守
// (REG-ADM0-002 共享底线: user cookie → 401 反向断言).
//
// 跨端字面拆死: admin 端走英文 enum action (delete_channel/suspend_user/
// change_role/reset_password/start_impersonation), 用户端 Settings/AdminActionsList
// 走中文动词字面 (ACTION_VERBS map). 改 enum = 改 server admin_actions CHECK
// constraint + admin SPA + user SPA 三处.
export interface AdminActionRow {
  id: string;
  actor_id: string; // admin_view=true 包含 (UUID 字符串)
  target_user_id: string;
  action: string;   // 英文 enum (跟 server CHECK constraint byte-identical)
  metadata: string; // JSON 字符串 (server 不挂 body/content/text/artifact 字段, god-mode 仅元数据)
  created_at: number; // Unix ms
}

export interface AuditLogFilters {
  actor_id?: string;
  action?: string;
  target_user_id?: string;
}

export async function fetchAdminAuditLog(filters: AuditLogFilters = {}): Promise<AdminActionRow[]> {
  const qs = new URLSearchParams();
  if (filters.actor_id) qs.set('actor_id', filters.actor_id);
  if (filters.action) qs.set('action', filters.action);
  if (filters.target_user_id) qs.set('target_user_id', filters.target_user_id);
  const path = qs.toString() ? `/audit-log?${qs.toString()}` : '/audit-log';
  const data = await request<{ actions: AdminActionRow[] }>(path);
  return data.actions;
}

// AL-9.1 — admin SPA SSE audit live monitor 错码 toast 双向锁.
// server const single-source: internal/api/audit_events.go::AuditErrCode*
// 改 = 改三处: server const + 此 map + content-lock §3 (跟 CV-6 SEARCH_ERR_TOAST
// / AP-2 / AP-3 / CV-2 v2 / CV-3 v2 同模式).
export const AUDIT_ERR_TOAST: Record<string, string> = {
  'audit.not_admin':           '需要管理员权限',
  'audit.cursor_invalid':      'since cursor 不合法',
  'audit.sse_unsupported':     '浏览器不支持 SSE',
  'audit.cross_org_denied':    '跨组织 audit 被禁',
  'audit.connection_dropped':  '连接已断, 正在重连',
};

// AL-9.1 SSE 状态文案 byte-identical (content-lock §1).
// 改 = 改三处: 此 const + AuditLogStream data-state 渲染 + content-lock §1.
export const AUDIT_SSE_STATUS = {
  connected:     '已连接',
  reconnecting:  '重连中…',
  disconnected:  '断开',
} as const;

export type AuditSSEState = keyof typeof AUDIT_SSE_STATUS;

// AuditEventFrame — 7 字段 byte-identical 跟 server
// internal/ws/audit_event_frame.go::AuditEventFrame envelope.
export interface AuditEventFrame {
  type: 'audit_event';
  cursor: number;
  action_id: string;
  actor_id: string;
  action: string;
  target_user_id: string;
  created_at: number;
}
