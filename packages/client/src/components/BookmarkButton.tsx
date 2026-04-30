// BookmarkButton — DM-8.3 toggle button for one message.
//
// Spec: docs/implementation/modules/dm-8-spec.md §1 拆段 DM-8.3.
// Acceptance: docs/qa/acceptance-templates/dm-8.md §3.1 + §3.4.
// Content lock: docs/qa/dm-8-content-lock.md §1 (4 文案) + §2 (DOM).
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2):
//   - button[data-testid="bookmark-btn"][data-bookmarked={true|false}]
//   - title attr toggles 取消收藏 (when on) vs 收藏 (when off)
//   - text content: 收藏 (off) / 已收藏 (on)
//
// 反约束: 4 文案 byte-identical (BOOKMARK_LABEL); 同义词反向 grep
// (`star/save/pin/favorite/⭐/♡/★`) 在源文件 0 hit.

import React, { useState } from 'react';
import {
  BOOKMARK_LABEL,
  addMessageBookmark,
  removeMessageBookmark,
  BOOKMARK_ERR_TOAST,
} from '../lib/api';

interface BookmarkButtonProps {
  messageId: string;
  initialBookmarked?: boolean;
  onChange?: (bookmarked: boolean) => void;
  onError?: (toast: string) => void;
}

export default function BookmarkButton({
  messageId,
  initialBookmarked = false,
  onChange,
  onError,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    const next = !bookmarked;
    try {
      const resp = next
        ? await addMessageBookmark(messageId)
        : await removeMessageBookmark(messageId);
      setBookmarked(resp.is_bookmarked);
      onChange?.(resp.is_bookmarked);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown';
      const toast = BOOKMARK_ERR_TOAST[code] ?? '收藏操作失败';
      onError?.(toast);
    } finally {
      setBusy(false);
    }
  };

  // 立场 ④ 文案锁: hover title differs by state (取消收藏 vs 收藏).
  const title = bookmarked ? BOOKMARK_LABEL.hover_off : BOOKMARK_LABEL.off;
  const label = bookmarked ? BOOKMARK_LABEL.on : BOOKMARK_LABEL.off;

  return (
    <button
      type="button"
      className="bookmark-btn"
      data-testid="bookmark-btn"
      data-bookmarked={bookmarked ? 'true' : 'false'}
      title={title}
      aria-pressed={bookmarked}
      disabled={busy}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
