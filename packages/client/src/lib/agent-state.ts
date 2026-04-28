// AL-1a (#R3 Phase 2) — Agent runtime state 文案锁.
//
// 野马 #190 §11 硬条件: Phase 2 Sidebar 不准 "灰点 + 不说原因" 糊弄. 状态
// 必须明确文案 ("已离线" 而不是模糊 idle 灰), 故障态必须可解释 (蓝图
// agent-lifecycle §2.3 "故障态的关键设计").
//
// 改这里 = 改 server 的 agent.Reason* 常量字符串. 单测 agent-state.test.ts
// 跟 internal/agent/state.go 字面绑定.
import type { AgentRuntimeReason, AgentRuntimeState } from './api';

export interface AgentStateLabel {
  text: string;
  tone: 'ok' | 'muted' | 'error';
}

export const REASON_LABELS: Record<AgentRuntimeReason, string> = {
  api_key_invalid: 'API key 失效',
  quota_exceeded: '已超出配额',
  network_unreachable: '网络不可达',
  runtime_crashed: 'Runtime 崩溃',
  runtime_timeout: 'Runtime 超时',
  unknown: '未知错误',
};

export function describeAgentState(
  state: AgentRuntimeState | undefined,
  reason: AgentRuntimeReason | undefined,
): AgentStateLabel {
  if (state === 'online') return { text: '在线', tone: 'ok' };
  if (state === 'error') {
    const reasonText = reason ? REASON_LABELS[reason] ?? reason : '未知错误';
    return { text: `故障 (${reasonText})`, tone: 'error' };
  }
  // Default + 'offline' bucket — 蓝图 §2.3 守: 不准糊弄 idle 灰.
  return { text: '已离线', tone: 'muted' };
}
