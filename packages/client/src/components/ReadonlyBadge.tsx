// ReadonlyBadge — CHN-15.3 small badge shown when channel is readonly.
//
// Spec: docs/implementation/modules/chn-15-spec.md §1 拆段 CHN-15.3.
// Content lock: docs/qa/chn-15-content-lock.md §2.2.
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2.2):
//   - span[data-testid="readonly-badge"][aria-label="只读频道"]
//   - text content "只读" byte-identical
//   - readonly=false → return null (反向断言: 非只读频道无 badge)
import React from 'react';

interface ReadonlyBadgeProps {
  readonly: boolean;
}

export default function ReadonlyBadge({ readonly }: ReadonlyBadgeProps) {
  if (!readonly) return null;
  return (
    <span
      className="readonly-badge"
      data-testid="readonly-badge"
      aria-label="只读频道"
    >
      只读
    </span>
  );
}
