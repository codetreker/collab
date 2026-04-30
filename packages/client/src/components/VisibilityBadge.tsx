// VisibilityBadge.tsx — CHN-9.2 channel visibility 三态 badge.
//
// 反约束 (chn-9-content-lock.md §1+§2):
//   - <span> + data-visibility ∈ {creator_only/private/public}
//   - 文案 byte-identical: `🔒 仅创建者` / `👥 成员可见` / `🌐 组织内可见`
//   - 同义词反向 reject: secret/exclusive/team-only/外部/外公/绝密/公共
//   - 调用 lib/visibility.ts::VISIBILITY_LABELS 单源
import { VISIBILITY_LABELS, type ChannelVisibility } from '../lib/visibility';

interface VisibilityBadgeProps {
  visibility: ChannelVisibility;
}

export function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  const label = VISIBILITY_LABELS[visibility];
  if (!label) return null;
  return (
    <span
      className="visibility-badge"
      data-visibility={visibility}
      title={`可见性: ${label.text}`}
    >
      {label.emoji} {label.text}
    </span>
  );
}

export default VisibilityBadge;
