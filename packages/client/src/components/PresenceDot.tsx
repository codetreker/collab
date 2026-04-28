// AL-3.3 (#R3 Phase 2) — Agent runtime PresenceDot component.
//
// 蓝图 docs/blueprint/agent-lifecycle.md §2.3 + §11 文案守:
// Phase 2 仅承诺 online / offline + error 旁路 (busy/idle 留 BPP-1 同期).
// Sidebar 严禁 "灰点不说原因" — 离线必须明确 "已离线", 故障必须显 reason.
//
// DOM 字面锁 (AL-3 acceptance §3.1):
//   data-presence="online"  + 绿点 + 文本 "在线"
//   data-presence="offline" + 文本 "已离线"
//   data-presence="error"   + 文本 "故障 (REASON_LABEL)"
//
// 反约束 (acceptance §3.2): 仅 agent 行带 dot, 人 (role='user'/'admin') 行无槽位.
// 调用方决定是否渲染 PresenceDot — 这个组件本身不判 role, 由 caller 控制.
//
// 反约束 (acceptance §5.1 / 5.4): busy / idle 不存在; 每 presence-dot 必带 sibling
// text — 这里通过 inline 渲染保证 dot + text 永远成对出现.
import React from 'react';
import type { AgentRuntimeState, AgentRuntimeReason } from '../lib/api';
import { describeAgentState } from '../lib/agent-state';

export interface PresenceDotProps {
  state: AgentRuntimeState | undefined;
  reason: AgentRuntimeReason | undefined;
  /** Compact mode: 仅 dot, 文案放 title (用于密集列表如 sidebar DM 行). */
  compact?: boolean;
}

// normalizeState — undefined / 未知值兜底为 'offline' (野马 §11 不准糊弄).
function normalizeState(s: AgentRuntimeState | undefined): AgentRuntimeState {
  if (s === 'online' || s === 'error') return s;
  return 'offline';
}

export default function PresenceDot({ state, reason, compact = false }: PresenceDotProps) {
  const normalized = normalizeState(state);
  const label = describeAgentState(state, reason);
  // dot 颜色全部从 CSS 类来 — 改色不许在这里硬写, 防止 a11y 退化.
  const dotClass = `presence-dot presence-${normalized}`;

  if (compact) {
    return (
      <span
        className="presence-inline presence-inline-compact"
        data-presence={normalized}
        data-reason={reason ?? ''}
        title={label.text}
      >
        <span className={dotClass} aria-hidden="true" />
        <span className="sr-only">{label.text}</span>
      </span>
    );
  }
  return (
    <span
      className="presence-inline"
      data-presence={normalized}
      data-reason={reason ?? ''}
    >
      <span className={dotClass} aria-hidden="true" />
      <span className="presence-text">{label.text}</span>
    </span>
  );
}
