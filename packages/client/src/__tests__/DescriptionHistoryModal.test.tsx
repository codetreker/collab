// DescriptionHistoryModal.test.tsx — CHN-14.3 5 vitest cases pin content-lock.
//
// Cases:
//   ① title `编辑历史` 4 字 byte-identical
//   ② empty `暂无编辑记录` 6 字 byte-identical (空 history 显式空态)
//   ③ history 行 `: 修改了说明` byte-identical (前缀冒号+空格)
//   ④ 时间戳 RFC3339 byte-identical
//   ⑤ 同义词反向 reject — source grep 0 hit (data-testid 例外)

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
// @ts-expect-error — node:module no @types/node
import { createRequire } from 'module';
import { DescriptionHistoryModal } from '../components/DescriptionHistoryModal';
import * as api from '../lib/api';

const nodeRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = nodeRequire('fs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodePath: any = nodeRequire('path');
// ESM workaround — __dirname undefined in `tsc -b` ESM emit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeUrl: any = nodeRequire('url');
const HERE = nodePath.dirname(nodeUrl.fileURLToPath(import.meta.url));

describe('CHN-14.3 DescriptionHistoryModal content-lock', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it('① title `编辑历史` byte-identical (跟 DM-7 EditHistoryModal 同源)', async () => {
    vi.spyOn(api, 'getChannelDescriptionHistory').mockResolvedValue({
      history: [{ old_content: 'old-v1', ts: 1700000000000, reason: 'unknown' }],
    });
    await act(async () => {
      root!.render(<DescriptionHistoryModal channelID="ch-1" onClose={() => {}} />);
    });
    await new Promise((r) => setTimeout(r, 50));
    const modal = container!.querySelector(
      '[data-testid="description-history-modal"]',
    );
    expect(modal).not.toBeNull();
    const h3 = modal!.querySelector('h3');
    expect(h3?.textContent).toBe('编辑历史');
  });

  it('② 空 history 显示 `暂无编辑记录` byte-identical', async () => {
    vi.spyOn(api, 'getChannelDescriptionHistory').mockResolvedValue({
      history: [],
    });
    await act(async () => {
      root!.render(<DescriptionHistoryModal channelID="ch-2" onClose={() => {}} />);
    });
    await new Promise((r) => setTimeout(r, 50));
    const empty = container!.querySelector(
      '[data-testid="description-history-empty"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toBe('暂无编辑记录');
  });

  it('③ history 行 action `: 修改了说明` byte-identical', async () => {
    vi.spyOn(api, 'getChannelDescriptionHistory').mockResolvedValue({
      history: [{ old_content: 'foo', ts: 1700000000000, reason: 'unknown' }],
    });
    await act(async () => {
      root!.render(<DescriptionHistoryModal channelID="ch-3" onClose={() => {}} />);
    });
    await new Promise((r) => setTimeout(r, 50));
    const action = container!.querySelector('.description-history-action');
    expect(action).not.toBeNull();
    expect(action!.textContent).toBe(': 修改了说明');
  });

  it('④ 时间戳 RFC3339 byte-identical (跟 DM-7 + CHN-1.2 同源)', async () => {
    const ts = 1700000000000;
    vi.spyOn(api, 'getChannelDescriptionHistory').mockResolvedValue({
      history: [{ old_content: 'foo', ts, reason: 'unknown' }],
    });
    await act(async () => {
      root!.render(<DescriptionHistoryModal channelID="ch-4" onClose={() => {}} />);
    });
    await new Promise((r) => setTimeout(r, 50));
    const time = container!.querySelector('time.description-history-ts');
    expect(time).not.toBeNull();
    const expected = new Date(ts).toISOString();
    expect(time!.textContent).toBe(expected);
    expect(time!.getAttribute('dateTime')).toBe(expected);
  });

  it('⑤ 同义词反向 reject — source grep 0 hit (data-testid + className 例外)', () => {
    const p = nodePath.resolve(HERE, '..', 'components', 'DescriptionHistoryModal.tsx');
    const src: string = fs.readFileSync(p, 'utf8');
    // user-visible Chinese 反向 reject — 我们用 `编辑历史` / `暂无编辑记录` / `修改了说明`.
    for (const tok of ['记录', '日志', '审计']) {
      // `记录` 在 `暂无编辑记录` 中作为合法字符出现, 我们检查独立的反义同义.
      if (tok === '记录') continue; // 我们的固定文案含此字 — skip.
      expect(src.includes(tok)).toBe(false);
    }
    // English 同义词 — 反 reject (data-testid + className 例外).
    // 我们的 component 完全没用 audit/log/History (大写) 之 user-visible.
    expect(src.includes('Audit')).toBe(false);
    expect(src.includes('Log')).toBe(false);
    // `回退 / 恢复` 反义 — 反 reject (跟 rollback / restore 拆死).
    expect(src.includes('回退')).toBe(false);
    expect(src.includes('恢复')).toBe(false);
  });
});
