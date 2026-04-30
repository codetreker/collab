// MuteButton.tsx — CHN-7.2 channel mute/unmute toggle.
//
// 反约束 (chn-7-content-lock.md §1):
//   - 文案 byte-identical: `静音` 2 字 (未 mute) / `取消静音` 4 字 (已 mute)
//   - data-action="mute" / "unmute" 二态
//   - 同义词反向 reject: mute/silence/dnd/disturb/quiet/屏蔽/关闭通知/勿扰
//   - 调用 lib/api.ts::muteChannel 单源.
import { useState } from 'react';
import { muteChannel } from '../lib/api';

interface MuteButtonProps {
  channelId: string;
  muted: boolean;
  onChange?: (muted: boolean) => void;
}

export function MuteButton({ channelId, muted, onChange }: MuteButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await muteChannel(channelId, !muted);
      onChange?.(!muted);
    } catch {
      // toast handled upstream
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="btn btn-sm btn-mute"
      data-action={muted ? 'unmute' : 'mute'}
      disabled={busy}
      onClick={handleClick}
    >
      {muted ? '取消静音' : '静音'}
    </button>
  );
}

export default MuteButton;
