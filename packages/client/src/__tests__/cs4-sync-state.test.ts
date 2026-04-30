// CS-4.1 — SyncState 4-enum + 文案 byte-identical 单测 (cs-4-content-lock §1).
import { describe, it, expect } from 'vitest';
import {
  type SyncState,
  SYNC_STATE_LABELS,
  SYNCING_LABEL_DELAY_MS,
} from '../lib/cs4-sync-state';

describe('CS-4.1 — SyncState 4-enum byte-identical (蓝图 §1.4)', () => {
  it('TestCS41_SyncStateLabels_ByteIdentical — 字面 byte-identical 跟 content-lock §1', () => {
    expect(SYNC_STATE_LABELS.offline_cache_hit).toBe('离线模式');
    expect(SYNC_STATE_LABELS.synced).toBe('已同步');
    expect(SYNC_STATE_LABELS.syncing).toBe('同步中…');
    expect(SYNC_STATE_LABELS.cache_miss).toBe(''); // not rendered
  });

  it('TestCS41_SyncState_4EnumExhaustive — 4 keys, no 第 5 态', () => {
    const keys = Object.keys(SYNC_STATE_LABELS).sort();
    expect(keys).toEqual(['cache_miss', 'offline_cache_hit', 'synced', 'syncing']);
  });

  it('TestCS41_SyncingLabelDelay_3000ms — 沉默胜于假 loading 阈值', () => {
    expect(SYNCING_LABEL_DELAY_MS).toBe(3000);
  });

  it('TestCS41_NoSynonymDrift — 同义词反向 (cs-4-content-lock §1)', () => {
    const banned = ['本地缓存', '离线缓存', '已加载', '加载完成', '准备中'];
    const allLabels = Object.values(SYNC_STATE_LABELS).join(' | ');
    for (const word of banned) {
      expect(allLabels.includes(word), `synonym drift: ${word}`).toBe(false);
    }
  });

  it('TestCS41_SyncStateType_Exported — type compiles', () => {
    const test: SyncState = 'synced';
    expect(test).toBe('synced');
  });
});
