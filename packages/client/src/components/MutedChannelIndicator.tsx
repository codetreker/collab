// MutedChannelIndicator.tsx — CHN-7.2 行内 indicator showing 已静音.
//
// 反约束 (chn-7-content-lock.md §2):
//   - <span> + data-testid="muted-channel-indicator" + title="已静音"
//   - 文案 `已静音` 3 字 byte-identical
//   - emoji 🔕 byte-identical
//   - muted=false 不渲染 (return null)

interface MutedChannelIndicatorProps {
  muted: boolean;
}

export function MutedChannelIndicator({ muted }: MutedChannelIndicatorProps) {
  if (!muted) return null;
  return (
    <span
      className="muted-channel-indicator"
      data-testid="muted-channel-indicator"
      title="已静音"
    >
      🔕 已静音
    </span>
  );
}

export default MutedChannelIndicator;
