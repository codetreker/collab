// ─── REST API client ─────────────────────────────────────

import type { Channel, Message, User, AdminUser, DmChannel } from '../types';

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

export async function createChannel(name: string, topic?: string): Promise<Channel> {
  const data = await request<{ channel: Channel }>('/api/v1/channels', {
    method: 'POST',
    body: JSON.stringify({ name, topic }),
  });
  return data.channel;
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

// ─── Admin ──────────────────────────────────────────────

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await request<{ users: AdminUser[] }>('/api/v1/admin/users');
  return data.users;
}

export async function createAdminUser(data: {
  email: string;
  password: string;
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
    method: 'PUT',
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
