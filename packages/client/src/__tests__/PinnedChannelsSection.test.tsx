// PinnedChannelsSection.test.tsx — CHN-6.2 顶部 section DOM byte-identical
// + filter byte-identical + empty state null + 同义词反向.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PinnedChannelsSection } from '../components/PinnedChannelsSection';
import { POSITION_PIN_THRESHOLD, isPinned } from '../lib/pin';
import type { Channel } from '../types';

let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
});

function ch(id: string, name: string, position: number): Channel & { position: number } {
  return {
    id,
    name,
    org_id: 'org-1',
    creator_id: 'u-1',
    visibility: 'public',
    type: 'channel',
    created_at: 1700000000000,
    position,
  } as unknown as Channel & { position: number };
}

describe('PinnedChannelsSection — CHN-6.2 DOM + 过滤 + empty state', () => {
  it('list rendering + DOM byte-identical', () => {
    const root = createRoot(container!);
    act(() => {
      root.render(
        <PinnedChannelsSection
          channels={[
            ch('c-1', 'pinned-a', -1700000000000),
            ch('c-2', 'pinned-b', -1700000001000),
            ch('c-3', 'normal-x', 1),
          ]}
        />,
      );
    });

    const section = container!.querySelector('[data-testid="pinned-channels-section"]');
    expect(section).not.toBeNull();
    const header = section!.querySelector('header');
    expect(header?.textContent).toBe('已置顶频道');

    // Only 2 pinned items rendered (position < 0 filter).
    const items = container!.querySelectorAll('[data-pinned="true"]');
    expect(items.length).toBe(2);
  });

  it('empty state — section 不渲染 (return null)', () => {
    const root = createRoot(container!);
    act(() => {
      root.render(
        <PinnedChannelsSection
          channels={[ch('c-1', 'normal', 1), ch('c-2', 'normal', 2)]}
        />,
      );
    });
    const section = container!.querySelector('[data-testid="pinned-channels-section"]');
    expect(section).toBeNull();
  });

  it('PinThreshold byte-identical 双向锁 + isPinned 谓词单源', () => {
    expect(POSITION_PIN_THRESHOLD).toBe(0);
    expect(isPinned(-1)).toBe(true);
    expect(isPinned(0)).toBe(false);
    expect(isPinned(1)).toBe(false);
  });

  it('反向断言 — 同义词 0 出现在 DOM', () => {
    const root = createRoot(container!);
    act(() => {
      root.render(
        <PinnedChannelsSection
          channels={[ch('c-1', 'pinned', -1700000000000)]}
        />,
      );
    });
    const html = container!.innerHTML;
    const forbidden = ['收藏', '标星', 'star', 'favorite', '顶置', '钉住'];
    for (const f of forbidden) {
      expect(html).not.toContain(f);
    }
  });
});
