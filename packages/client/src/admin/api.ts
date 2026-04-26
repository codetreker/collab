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

export interface AdminStats {
  user_count: number;
  channel_count: number;
  online_count: number;
}

export interface AdminUser {
  id: string;
  display_name: string;
  email?: string | null;
  role: 'member' | 'agent';
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
