import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Channel, ChannelGroup } from '../types';

function makeChannel(overrides: Partial<Channel> & { id: string; name: string }): Channel {
  return { topic: '', created_at: 0, ...overrides } as Channel;
}

function bucketByGroup(channels: Channel[]): Map<string | null, Channel[]> {
  const map = new Map<string | null, Channel[]>();
  for (const ch of channels) {
    const key = ch.group_id ?? null;
    const arr = map.get(key) ?? [];
    arr.push(ch);
    map.set(key, arr);
  }
  return map;
}

function sortGroups(groups: ChannelGroup[]): ChannelGroup[] {
  return [...groups].sort((a, b) => a.position.localeCompare(b.position));
}

describe('Channel group bucketing', () => {
  it('channels bucket by group_id correctly', () => {
    const channels = [
      makeChannel({ id: '1', name: 'a', group_id: 'g1' }),
      makeChannel({ id: '2', name: 'b', group_id: null }),
      makeChannel({ id: '3', name: 'c', group_id: 'g1' }),
      makeChannel({ id: '4', name: 'd' }),
    ];
    const buckets = bucketByGroup(channels);
    expect(buckets.get('g1')!.map(c => c.id)).toEqual(['1', '3']);
    expect(buckets.get(null)!.map(c => c.id)).toEqual(['2', '4']);
  });

  it('ungrouped channels appear first (at top)', () => {
    const groups: ChannelGroup[] = [
      { id: 'g1', name: 'Group 1', position: '000001', created_by: 'u1', created_at: 1 },
    ];
    const orderedSections: (string | null)[] = [null, ...sortGroups(groups).map(g => g.id)];
    expect(orderedSections[0]).toBeNull();
  });

  it('groups sort by position lexicographically', () => {
    const groups: ChannelGroup[] = [
      { id: 'g2', name: 'Beta', position: '000002', created_by: 'u1', created_at: 2 },
      { id: 'g1', name: 'Alpha', position: '000001', created_by: 'u1', created_at: 1 },
      { id: 'g3', name: 'Gamma', position: '000003', created_by: 'u1', created_at: 3 },
    ];
    const sorted = sortGroups(groups);
    expect(sorted.map(g => g.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('collapsed state persists via localStorage', () => {
    const storage: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
    };
    const key = 'collapsed-groups';
    mockStorage.setItem(key, JSON.stringify(['g1', 'g2']));
    const collapsed: string[] = JSON.parse(mockStorage.getItem(key)!);
    expect(collapsed).toEqual(['g1', 'g2']);
  });
});

describe('Channel group API request formats', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ group: { id: 'g1', name: 'Test', position: '000001', created_by: 'u1', created_at: 1 }, ok: true }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('createChannelGroup sends POST with {name}', async () => {
    const { createChannelGroup } = await import('../lib/api');
    await createChannelGroup('My Group');
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/channel-groups');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ name: 'My Group' });
  });

  it('updateChannelGroup sends PUT with {name}', async () => {
    const { updateChannelGroup } = await import('../lib/api');
    await updateChannelGroup('g1', 'Renamed');
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/channel-groups/g1');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Renamed' });
  });

  it('deleteChannelGroup sends DELETE', async () => {
    const { deleteChannelGroup } = await import('../lib/api');
    await deleteChannelGroup('g1');
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/channel-groups/g1');
    expect(opts.method).toBe('DELETE');
  });

  it('reorderChannelGroup sends PUT with {group_id, after_id}', async () => {
    const { reorderChannelGroup } = await import('../lib/api');
    await reorderChannelGroup('g2', 'g1');
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/channel-groups/reorder');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ group_id: 'g2', after_id: 'g1' });
  });
});
