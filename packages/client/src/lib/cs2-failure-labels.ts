// CS-2 — plain language reason 6-dict (蓝图 client-shape.md §1.3).
//
// 字面 byte-identical 跟蓝图 §1.3 字面 ("DevAgent 跟 OpenClaw 失联" /
// "API key 已失效, 需要重新填写") + reasons.IsValid #496 SSOT 6-dict +
// AL-4 #321 system DM 文案锁同源. 改 = 改三处:
//   - server: packages/server-go/internal/agent/reasons/reasons.go (字面键)
//   - client: 本文件 FAILURE_REASON_LABELS (用户文案)
//   - content-lock: docs/qa/cs-2-content-lock.md §3 (字面对账)
//
// 反约束 (cs-2-content-lock §3):
//   - 同义词漂禁: "故障了" / "挂了" / "不可用" / "服务异常" / "崩了" /
//     "掉线" 在本文件 0 hit.
//   - raw error code 不暴: "401 Unauthorized" / "connection refused" 等
//     wire 字面禁出现在 user-visible text.

import type { AgentRuntimeReason } from './api';

/**
 * FAILURE_REASON_LABELS — 6-dict reason → plain language template.
 *
 * Template 占位符 `{agent_name}` 由 formatFailureLabel() 替换. 跟
 * reasons.IsValid #496 ALL slice 顺序一致 (api_key_invalid /
 * quota_exceeded / network_unreachable / runtime_crashed /
 * runtime_timeout / unknown).
 */
export const FAILURE_REASON_LABELS: Record<AgentRuntimeReason, string> = {
  api_key_invalid: 'API key 已失效, 需要重新填写',
  quota_exceeded: '{agent_name} 的配额已用完',
  network_unreachable: '{agent_name} 跟 OpenClaw 失联',
  runtime_crashed: '{agent_name} 进程崩溃, 请重启',
  runtime_timeout: '{agent_name} 响应超时',
  unknown: '{agent_name} 出错, 请查日志',
};

/**
 * formatFailureLabel — 返 plain language label 字符串, 替换 {agent_name}.
 *
 * @param reason - 6-dict 内任意 key (out-of-dict → fallback 'unknown' 模板)
 * @param agentName - agent display name (空 string 时 fallback "agent")
 */
export function formatFailureLabel(
  reason: AgentRuntimeReason | undefined,
  agentName: string,
): string {
  const safeName = agentName && agentName.trim() ? agentName : 'agent';
  const tpl = (reason && FAILURE_REASON_LABELS[reason]) || FAILURE_REASON_LABELS.unknown;
  return tpl.replace(/\{agent_name\}/g, safeName);
}
