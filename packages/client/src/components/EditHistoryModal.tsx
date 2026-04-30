// EditHistoryModal — DM-7.3 edit history viewer (sender-only).
// 文案 byte-identical 跟 docs/qa/dm-7-content-lock.md §1.
import React, { useEffect, useState } from 'react';
import { getEditHistory, type DM7EditHistoryEntry } from '../lib/api';

interface Props {
  channelID: string;
  messageID: string;
  onClose: () => void;
}

export function EditHistoryModal({ channelID, messageID, onClose }: Props) {
  const [history, setHistory] = useState<DM7EditHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEditHistory(channelID, messageID)
      .then((resp) => {
        if (!cancelled) setHistory(resp.history || []);
      })
      .catch(() => {
        if (!cancelled) setError('加载编辑历史失败');
      });
    return () => {
      cancelled = true;
    };
  }, [channelID, messageID]);

  if (error) {
    return (
      <div data-testid="edit-history-modal-error" role="alert">
        {error}
      </div>
    );
  }
  if (history === null || history.length === 0) {
    return null;
  }

  return (
    <div
      className="edit-history-modal"
      data-testid="edit-history-modal"
      role="dialog"
    >
      <header className="edit-history-header">
        <h3>编辑历史</h3>
        <span className="edit-history-count">共 {history.length} 次编辑</span>
        <button
          type="button"
          className="edit-history-close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </header>
      <ul className="edit-history-list">
        {history.map((entry, i) => (
          <li
            key={i}
            className="edit-history-entry"
            data-history-index={i}
          >
            <time
              dateTime={new Date(entry.ts).toISOString()}
              className="edit-history-ts"
            >
              {new Date(entry.ts).toISOString()}
            </time>
            <pre className="edit-history-old-content">{entry.old_content}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
