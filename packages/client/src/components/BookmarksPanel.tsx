// BookmarksPanel — DM-8.3 list panel for the current user's bookmarks.
//
// Spec: docs/implementation/modules/dm-8-spec.md §1 拆段 DM-8.3.
// Acceptance: docs/qa/acceptance-templates/dm-8.md §3.2.
// Content lock: docs/qa/dm-8-content-lock.md §2 (DOM) + §1 (`我的收藏`
// title byte-identical).
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2):
//   - section[data-testid="bookmarks-panel"][aria-label="我的收藏"]
//   - h2.bookmarks-panel-title text "我的收藏"
//   - li[data-testid="bookmark-row"][data-message-id][data-channel-id]
//
// 反约束: title 1 文案 byte-identical (BOOKMARK_LABEL.panel_title);
// onJump callback 跳转到原 message anchor (caller responsibility).

import React, { useEffect, useState } from 'react';
import {
  BOOKMARK_LABEL,
  type BookmarkRow,
  listMyBookmarks,
} from '../lib/api';

interface BookmarksPanelProps {
  onJump?: (channelId: string, messageId: string) => void;
}

export default function BookmarksPanel({ onJump }: BookmarksPanelProps) {
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyBookmarks()
      .then((data) => {
        if (!cancelled) setRows(data.bookmarks);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="bookmarks-panel"
      data-testid="bookmarks-panel"
      aria-label={BOOKMARK_LABEL.panel_title}
    >
      <h2 className="bookmarks-panel-title">{BOOKMARK_LABEL.panel_title}</h2>

      {error && (
        <p className="bookmarks-panel-error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="bookmarks-panel-loading">…</p>
      )}

      {rows !== null && rows.length === 0 && (
        <p className="bookmarks-panel-empty">还没有收藏</p>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="bookmarks-list">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="bookmark-row"
              data-message-id={r.id}
              data-channel-id={r.channel_id}
              className="bookmark-row"
              onClick={() => onJump?.(r.channel_id, r.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onJump?.(r.channel_id, r.id);
                }
              }}
            >
              <span className="bookmark-row-content">{r.content}</span>
              <span className="bookmark-row-time">
                {new Date(r.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
