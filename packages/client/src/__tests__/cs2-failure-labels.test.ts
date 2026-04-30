// CS-2.1 — plain language 6-dict 单测 (cs-2-content-lock §3).
import { describe, it, expect } from 'vitest';
import { FAILURE_REASON_LABELS, formatFailureLabel } from '../lib/cs2-failure-labels';

describe('CS-2.1 — FAILURE_REASON_LABELS byte-identical (蓝图 §1.3 plain language)', () => {
  it('TestCS21_FailureLabels_6DictByteIdentical — 6 keys 跟 reasons.IsValid #496 同源', () => {
    const keys = Object.keys(FAILURE_REASON_LABELS).sort();
    expect(keys).toEqual([
      'api_key_invalid',
      'network_unreachable',
      'quota_exceeded',
      'runtime_crashed',
      'runtime_timeout',
      'unknown',
    ]);
  });

  it('TestCS21_FailureLabels_BlueprintLiteral — 字面 byte-identical 跟蓝图 §1.3', () => {
    // 蓝图字面: "API key 已失效, 需要重新填写"
    expect(FAILURE_REASON_LABELS.api_key_invalid).toBe('API key 已失效, 需要重新填写');
    // 蓝图字面: "DevAgent 跟 OpenClaw 失联" — 模板 + 占位符
    expect(FAILURE_REASON_LABELS.network_unreachable).toBe('{agent_name} 跟 OpenClaw 失联');
  });

  it('TestCS21_formatFailureLabel_AgentNamePlaceholder — 占位符替换', () => {
    expect(formatFailureLabel('network_unreachable', 'DevAgent')).toBe('DevAgent 跟 OpenClaw 失联');
    expect(formatFailureLabel('runtime_crashed', 'BugAgent')).toBe('BugAgent 进程崩溃, 请重启');
  });

  it('TestCS21_formatFailureLabel_EmptyAgentNameFallback — 空 agentName fallback "agent"', () => {
    expect(formatFailureLabel('network_unreachable', '')).toBe('agent 跟 OpenClaw 失联');
    expect(formatFailureLabel('network_unreachable', '   ')).toBe('agent 跟 OpenClaw 失联');
  });

  it('TestCS21_formatFailureLabel_UnknownReasonFallback — undefined → unknown 模板', () => {
    expect(formatFailureLabel(undefined, 'Foo')).toBe('Foo 出错, 请查日志');
  });

  it('TestCS21_NoSynonymDrift — 同义词反向 (cs-2-content-lock §3)', () => {
    const banned = ['故障了', '挂了', '不可用', '服务异常', '崩了', '掉线'];
    const allLabels = Object.values(FAILURE_REASON_LABELS).join(' | ');
    for (const word of banned) {
      expect(allLabels.includes(word), `synonym drift: ${word}`).toBe(false);
    }
  });

  it('TestCS21_NoRawErrorCodeLeak — raw error code 不暴 (蓝图 §1.3 plain language)', () => {
    const rawCodes = ['401 Unauthorized', 'connection refused', 'invalid_token', 'openclaw://'];
    const allLabels = Object.values(FAILURE_REASON_LABELS).join(' | ');
    for (const code of rawCodes) {
      expect(allLabels.includes(code), `raw error code leak: ${code}`).toBe(false);
    }
  });
});
