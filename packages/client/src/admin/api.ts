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
  // ADMIN-SPA-SHAPE-FIX D2: server `internal/admin/auth.go::handleMe`
  // (auth.go:281,314) byte-identical 真返 `{id, login}` 2 字段, 不返 role /
  // username / admin_id / expires_at. 之前 `{role, username}` 是 client 自创
  // 假字段 (UI render undefined). 改 client interface 跟 server SSOT 锁.
  id: string;
  login: string;
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
  // ADMIN-SPA-SHAPE-FIX D3: `member_count` 死字段删 — server `Channel`
  // gorm json (`store/models.go::Channel`) 不返 member_count, 客户端永显
  // undefined. 反向 grep `member_count` in client/admin/ 0 hit (post-fix).
}

export interface InviteCode {
  code: string;
  created_by: string;
  created_at: number;
  expires_at?: number | null;
  used_by?: string | null;
  used_at?: number | null;
  // ADMIN-SPA-SHAPE-FIX D5: server `store.InviteCode.Note string \`json:"note"\``
  // 真返 non-null (默认 ""). client 类型 narrowing 守.
  note: string;
}

export async function adminLogin(login: string, password: string): Promise<AdminSession> {
  // ADMIN-SPA-SHAPE-FIX D1+D2: server `loginRequest{Login,Password}` (auth.go)
  // — body 字段 `login` 不是 `username`. response (auth.go:281) 返
  // `{id, login}` 不是 `{token}` (token 走 Set-Cookie cookie 不在 body).
  return request<AdminSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
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
  // ADMIN-SPA-SHAPE-FIX D4: AL-8 §0 立场 ③ archived 三态. server `sanitizeAdminAction`
  // (admin_endpoints.go) nil-safe surface — null/缺 = active, non-null = archived.
  archived_at?: number | null;
}

export interface AuditLogFilters {
  actor_id?: string;
  action?: string;
  target_user_id?: string;
  // ADMIN-SPA-ARCHIVED-UI-FOLLOWUP: AL-8 §0 立场 ③ archived 三态 filter.
  // server `?archived=active|archived|all`; 空 = "active" 默认 (跟 server
  // admin_endpoints.go::handleAdminAuditLog 字面 byte-identical, drift = 改两处).
  archived?: 'active' | 'archived' | 'all';
}

export async function fetchAdminAuditLog(filters: AuditLogFilters = {}): Promise<AdminActionRow[]> {
  const qs = new URLSearchParams();
  if (filters.actor_id) qs.set('actor_id', filters.actor_id);
  if (filters.action) qs.set('action', filters.action);
  if (filters.target_user_id) qs.set('target_user_id', filters.target_user_id);
  if (filters.archived) qs.set('archived', filters.archived);
  const path = qs.toString() ? `/audit-log?${qs.toString()}` : '/audit-log';
  const data = await request<{ actions: AdminActionRow[] }>(path);
  return data.actions;
}

// ADM-3 multi-source audit query (蓝图 admin-model.md §1.4 来源透明 4 类:
// server / plugin / host_bridge / agent). 4 source enum byte-identical 跟
// server-side AuditSources 同源 (改 = 改 server const + 此处 + i18n 三处).
//
// admin god-mode 路径独立 (ADM-0 §1.3 红线): 仅 /admin-api/v1/audit/multi-source
// 暴露, 反 user-rail 漂.
export const AUDIT_SOURCES = ['server', 'plugin', 'host_bridge', 'agent'] as const;
export type AuditSource = typeof AUDIT_SOURCES[number];

export interface MultiSourceAuditRow {
  source: AuditSource;
  ts: number;
  actor: string;
  action: string;
  payload: string;
}

export interface MultiSourceAuditFilters {
  source?: AuditSource;
  since?: number;
  until?: number;
  limit?: number;
}

export async function fetchMultiSourceAudit(filters: MultiSourceAuditFilters = {}): Promise<MultiSourceAuditRow[]> {
  const qs = new URLSearchParams();
  if (filters.source) qs.set('source', filters.source);
  if (filters.since) qs.set('since', String(filters.since));
  if (filters.until) qs.set('until', String(filters.until));
  if (filters.limit) qs.set('limit', String(filters.limit));
  const path = qs.toString() ? `/audit/multi-source?${qs.toString()}` : '/audit/multi-source';
  const data = await request<{ sources: AuditSource[]; rows: MultiSourceAuditRow[] }>(path);
  return data.rows;
}
