// BookmarkButton.test.tsx — DM-8.3 acceptance §3.1 + §3.4 + content-lock
// §1 byte-identical pins.
//
// Pins:
//   - DOM contract (data-testid + data-bookmarked + aria-pressed)
//   - 4 文案 byte-identical (收藏 / 已收藏 / 取消收藏 / 我的收藏)
//   - BOOKMARK_ERR_TOAST 5 字面 byte-identical
//   - 同义词反向 grep (excluded by content-lock test below)

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BookmarkButton from '../components/BookmarkButton';
import {
  BOOKMARK_LABEL,
  BOOKMARK_ERR_TOAST,
} from '../lib/api';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Stub fetch globally (component calls add/remove which fetch).
  (globalThis as any).fetch = vi.fn(async () =>
    new Response(JSON.stringify({ message_id: 'msg-1', is_bookmarked: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
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

describe('BookmarkButton DOM contract', () => {
  it('renders with data-testid + data-bookmarked + aria-pressed', () => {
    render(<BookmarkButton messageId="msg-1" />);
    const btn = container!.querySelector('[data-testid="bookmark-btn"]');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('data-bookmarked')).toBe('false');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    expect(btn?.getAttribute('title')).toBe('收藏');
    expect(btn?.textContent).toBe('收藏');
  });

  it('renders bookmarked state when initialBookmarked=true', () => {
    render(<BookmarkButton messageId="msg-1" initialBookmarked={true} />);
    const btn = container!.querySelector('[data-testid="bookmark-btn"]');
    expect(btn?.getAttribute('data-bookmarked')).toBe('true');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    expect(btn?.getAttribute('title')).toBe('取消收藏');
    expect(btn?.textContent).toBe('已收藏');
  });
});

describe('BOOKMARK_LABEL byte-identical (content-lock §1)', () => {
  it('4 文案 byte-identical', () => {
    expect(BOOKMARK_LABEL.off).toBe('收藏');
    expect(BOOKMARK_LABEL.on).toBe('已收藏');
    expect(BOOKMARK_LABEL.hover_off).toBe('取消收藏');
    expect(BOOKMARK_LABEL.panel_title).toBe('我的收藏');
  });
});

describe('BOOKMARK_ERR_TOAST byte-identical (content-lock §3)', () => {
  it('5 错码字面单源 — byte-identical 跟 server const + content-lock', () => {
    expect(BOOKMARK_ERR_TOAST['bookmark.not_found']).toBe('消息不存在');
    expect(BOOKMARK_ERR_TOAST['bookmark.not_member']).toBe('无权访问此频道');
    expect(BOOKMARK_ERR_TOAST['bookmark.not_owner']).toBe('无权操作他人收藏');
    expect(BOOKMARK_ERR_TOAST['bookmark.cross_org_denied']).toBe('跨组织收藏被禁');
    expect(BOOKMARK_ERR_TOAST['bookmark.invalid_request']).toBe('请求格式不合法');
    expect(Object.keys(BOOKMARK_ERR_TOAST).sort()).toEqual([
      'bookmark.cross_org_denied',
      'bookmark.invalid_request',
      'bookmark.not_found',
      'bookmark.not_member',
      'bookmark.not_owner',
    ]);
  });
});
