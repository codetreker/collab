// BookmarksPanel.test.tsx — DM-8.3 acceptance §3.2 + content-lock §1+§2.
//
// Pins:
//   - section[data-testid="bookmarks-panel"] + aria-label "我的收藏"
//   - h2 title byte-identical "我的收藏"
//   - 列表渲染 li[data-testid="bookmark-row"][data-message-id][data-channel-id]
//   - empty state "还没有收藏"

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BookmarksPanel from '../components/BookmarksPanel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function stubFetch(rows: any[]) {
  (globalThis as any).fetch = vi.fn(async () =>
    new Response(JSON.stringify({ bookmarks: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
  vi.restoreAllMocks();
});

function render(node: React.ReactElement) {
  act(() => {
    root!.render(node);
  });
}

describe('BookmarksPanel', () => {
  it('renders section with data-testid + aria-label byte-identical', () => {
    stubFetch([]);
    render(<BookmarksPanel />);
    const section = container!.querySelector('[data-testid="bookmarks-panel"]');
    expect(section).toBeTruthy();
    expect(section?.getAttribute('aria-label')).toBe('我的收藏');
    const h2 = container!.querySelector('.bookmarks-panel-title');
    expect(h2?.textContent).toBe('我的收藏');
  });

  it('shows empty state "还没有收藏" when 0 bookmarks', async () => {
    stubFetch([]);
    render(<BookmarksPanel />);
    await flush();
    const empty = container!.querySelector('.bookmarks-panel-empty');
    expect(empty?.textContent).toBe('还没有收藏');
  });

  it('renders bookmark rows with data-* byte-identical', async () => {
    stubFetch([
      {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-A',
        content: 'first bookmark',
        content_type: 'text',
        created_at: 1700000000000,
        is_bookmarked: true,
      },
      {
        id: 'msg-2',
        channel_id: 'chan-1',
        sender_id: 'user-A',
        content: 'second bookmark',
        content_type: 'text',
        created_at: 1700000001000,
        is_bookmarked: true,
      },
    ]);
    render(<BookmarksPanel />);
    await flush();
    const rows = container!.querySelectorAll('[data-testid="bookmark-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('data-message-id')).toBe('msg-1');
    expect(rows[0].getAttribute('data-channel-id')).toBe('chan-1');
    expect(rows[1].getAttribute('data-message-id')).toBe('msg-2');
  });

  it('clicking a row fires onJump(channelId, messageId)', async () => {
    stubFetch([
      {
        id: 'msg-X',
        channel_id: 'chan-X',
        sender_id: 'user-A',
        content: 'x',
        content_type: 'text',
        created_at: 1,
        is_bookmarked: true,
      },
    ]);
    const onJump = vi.fn();
    render(<BookmarksPanel onJump={onJump} />);
    await flush();
    const row = container!.querySelector('[data-testid="bookmark-row"]') as HTMLElement;
    expect(row).toBeTruthy();
    act(() => {
      row.click();
    });
    expect(onJump).toHaveBeenCalledWith('chan-X', 'msg-X');
  });

  it('shows error state on fetch failure', async () => {
    (globalThis as any).fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bookmark.not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<BookmarksPanel />);
    await flush();
    const err = container!.querySelector('.bookmarks-panel-error');
    expect(err).toBeTruthy();
  });
});
