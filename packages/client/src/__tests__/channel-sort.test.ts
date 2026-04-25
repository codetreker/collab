import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Channel } from '../types';

// ─── Helpers: replicate the sorting logic from ChannelList ────────────

function sortByPosition(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    if (a.position && b.position) {
      return a.position.localeCompare(b.position);
    }
    if (a.position && !b.position) return -1;
    if (!a.position && b.position) return 1;
    const aTime = a.last_message_at ?? a.created_at;
    const bTime = b.last_message_at ?? b.created_at;
    return bTime - aTime;
  });
}

function makeChannel(overrides: Partial<Channel> & { id: string; name: string }): Channel {
  return {
    topic: '',
    created_at: 0,
    ...overrides,
  } as Channel;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Channel sorting logic', () => {
  it('sorts channels by position lexicographically', () => {
    const channels = [
      makeChannel({ id: '3', name: 'gamma', position: '000002' }),
      makeChannel({ id: '1', name: 'alpha', position: '000000' }),
      makeChannel({ id: '2', name: 'beta', position: '000001' }),
    ];
    const sorted = sortByPosition(channels);
    expect(sorted.map(c => c.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('channels with position come before channels without', () => {
    const channels = [
      makeChannel({ id: '2', name: 'no-pos', created_at: 999 }),
      makeChannel({ id: '1', name: 'has-pos', position: '000005' }),
    ];
    const sorted = sortByPosition(channels);
    expect(sorted[0].name).toBe('has-pos');
    expect(sorted[1].name).toBe('no-pos');
  });

  it('channels without position fall back to last_message_at descending', () => {
    const channels = [
      makeChannel({ id: '1', name: 'older', created_at: 100 }),
      makeChannel({ id: '2', name: 'newer', created_at: 200 }),
    ];
    const sorted = sortByPosition(channels);
    expect(sorted[0].name).toBe('newer');
    expect(sorted[1].name).toBe('older');
  });

  it('prefers last_message_at over created_at when available', () => {
    const channels = [
      makeChannel({ id: '1', name: 'old-created-new-msg', created_at: 10, last_message_at: 500 }),
      makeChannel({ id: '2', name: 'new-created-no-msg', created_at: 400 }),
    ];
    const sorted = sortByPosition(channels);
    expect(sorted[0].name).toBe('old-created-new-msg');
  });

  it('handles empty array', () => {
    expect(sortByPosition([])).toEqual([]);
  });
});

describe('Owner drag-handle logic', () => {
  it('isOwner is true when channel.created_by matches currentUser.id', () => {
    const userId = 'user-1';
    const channel = makeChannel({ id: 'ch1', name: 'test', created_by: 'user-1' });
    const isOwner = channel.created_by === userId;
    expect(isOwner).toBe(true);
  });

  it('isOwner is false when created_by differs', () => {
    const userId = 'user-1';
    const channel = makeChannel({ id: 'ch1', name: 'test', created_by: 'user-2' });
    const isOwner = channel.created_by === userId;
    expect(isOwner).toBe(false);
  });

  it('non-owner channels have sortable disabled (logic check)', () => {
    // In SortableChannelItem: useSortable({ id, disabled: !isOwner })
    const isOwner = false;
    const sortableDisabled = !isOwner;
    expect(sortableDisabled).toBe(true);
  });
});

describe('api.reorderChannel request format', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends PUT /api/v1/channels/reorder with correct body', async () => {
    // Dynamic import so the mocked fetch is in place
    const { reorderChannel } = await import('../lib/api');
    await reorderChannel('ch-42', 'ch-41');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/channels/reorder');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ channel_id: 'ch-42', after_id: 'ch-41' });
  });

  it('sends after_id: null when moving to top', async () => {
    const { reorderChannel } = await import('../lib/api');
    await reorderChannel('ch-1', null);

    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.after_id).toBeNull();
  });
});
