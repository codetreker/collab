// agent-state.test.ts — AL-1a (#R3 Phase 2) 文案锁单测.
// 改 REASON_LABELS / describeAgentState 字面 = 改这里 + server 同步.
import { describe, it, expect } from 'vitest';
import { describeAgentState, REASON_LABELS } from '../lib/agent-state';

describe('describeAgentState — 蓝图 §2.3 文案锁', () => {
  it('online → 在线', () => {
    expect(describeAgentState('online', undefined)).toEqual({ text: '在线', tone: 'ok' });
  });

  it('offline → 已离线 (野马 §11: 不准 idle 灰糊弄)', () => {
    expect(describeAgentState('offline', undefined)).toEqual({ text: '已离线', tone: 'muted' });
  });

  it('undefined state defaults to 已离线 (server 没回 state 时不糊弄)', () => {
    expect(describeAgentState(undefined, undefined)).toEqual({ text: '已离线', tone: 'muted' });
  });

  it('error api_key_invalid → 故障 (API key 失效)', () => {
    expect(describeAgentState('error', 'api_key_invalid')).toEqual({
      text: '故障 (API key 失效)',
      tone: 'error',
    });
  });

  it('error quota_exceeded → 故障 (已超出配额)', () => {
    expect(describeAgentState('error', 'quota_exceeded').text).toBe('故障 (已超出配额)');
  });

  it('error runtime_crashed → 故障 (Runtime 崩溃)', () => {
    expect(describeAgentState('error', 'runtime_crashed').text).toBe('故障 (Runtime 崩溃)');
  });

  it('error 没 reason 也得说"未知错误", 不准空括号糊弄', () => {
    expect(describeAgentState('error', undefined).text).toBe('故障 (未知错误)');
  });

  it('reason 表覆盖蓝图 §2.3 全部原因码 (lock — 加 reason 必须 + 中文 label)', () => {
    expect(Object.keys(REASON_LABELS).sort()).toEqual([
      'api_key_invalid',
      'network_unreachable',
      'quota_exceeded',
      'runtime_crashed',
      'runtime_timeout',
      'unknown',
    ]);
  });
});
