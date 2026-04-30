// CS-2 — FailurePopover 浮层 (蓝图 client-shape.md §1.3 第 2 层 UX 呈现).
//
// DOM 字面锁 (cs-2-content-lock §2):
//   <div data-cs2-failure-popover="open" role="dialog">
//     <div data-cs2-failure-reason>{plain language label}</div>
//     <button data-action="reconnect">重连</button>
//     <button data-action="refill_api_key">重填 API key</button>
//     <button data-action="view_logs">查日志</button>
//   </div>
//
// 反约束:
//   - 3 inline button 文案 byte-identical 跟蓝图字面 ("重连"/"重填 API key"/"查日志").
//   - 不跳设置页 (用 useFailureRepair stub, 不 navigate).
import React from 'react';
import type { AgentRuntimeReason } from '../lib/api';
import { formatFailureLabel } from '../lib/cs2-failure-labels';
import { useFailureRepair, type FailureRepairAction } from '../lib/use_failure_repair';

export interface FailurePopoverProps {
  /** 浮层是否打开 (caller 控制, click PresenceDot toggle). */
  open: boolean;
  reason: AgentRuntimeReason | undefined;
  agentName: string;
  /** Repair action 触发回调 (caller 可选拦截 stub result). */
  onRepair?: (action: FailureRepairAction) => void;
}

const REPAIR_BUTTONS: ReadonlyArray<{ action: FailureRepairAction; label: string }> = [
  { action: 'reconnect', label: '重连' },
  { action: 'refill_api_key', label: '重填 API key' },
  { action: 'view_logs', label: '查日志' },
];

export default function FailurePopover({
  open,
  reason,
  agentName,
  onRepair,
}: FailurePopoverProps) {
  const { handle } = useFailureRepair();
  if (!open) return null;
  const reasonText = formatFailureLabel(reason, agentName);
  const onClick = (action: FailureRepairAction) => {
    handle(action);
    onRepair?.(action);
  };
  return (
    <div
      className="cs2-failure-popover"
      data-cs2-failure-popover="open"
      role="dialog"
      aria-label="故障详情"
    >
      <div className="cs2-failure-reason" data-cs2-failure-reason>
        {reasonText}
      </div>
      <div className="cs2-failure-actions">
        {REPAIR_BUTTONS.map((b) => (
          <button
            key={b.action}
            type="button"
            data-action={b.action}
            data-cs2-failure-button
            onClick={() => onClick(b.action)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
