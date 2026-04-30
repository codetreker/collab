// ArtifactCommentEditHistoryModal — CV-15.3 sender-only history viewer
// for artifact comments (CV-5/CV-7). 文案 byte-identical 跟 DM-7
// EditHistoryModal §1 + content-lock §1 同源.
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2):
//   - div[data-testid="comment-edit-history-modal"][role="dialog"][aria-label="编辑历史"]
//   - h2.comment-edit-history-title 文案 "编辑历史"
//   - p.comment-edit-history-count 文案 "共 N 次编辑"
//   - empty: p.comment-edit-history-empty 文案 "暂无编辑记录"
//   - li[data-testid="comment-edit-history-entry"][data-ts]
//
// 反约束: 同义词反向 reject (changes/revisions/版本/修订/变更/回退) 0 hit.
import React, { useEffect, useState } from 'react';
import {
  getArtifactCommentEditHistory,
  type ArtifactCommentEditHistoryEntry,
  COMMENT_EDIT_HISTORY_ERR_TOAST,
} from '../lib/api';
import { COMMENT_EDIT_HISTORY_LABEL } from '../lib/comment_edit_history';

interface Props {
  channelID: string;
  messageID: string;
  onClose: () => void;
  onError?: (toast: string) => void;
}

export default function ArtifactCommentEditHistoryModal({
  channelID,
  messageID,
  onClose,
  onError,
}: Props) {
  const [history, setHistory] = useState<ArtifactCommentEditHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getArtifactCommentEditHistory(channelID, messageID)
      .then((resp) => {
        if (!cancelled) setHistory(resp.history || []);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown';
        const code = msg.replace(/^cv15\/comment-edit-history\s+/, '');
        const toast = COMMENT_EDIT_HISTORY_ERR_TOAST[code] ?? '加载评论编辑历史失败';
        onError?.(toast);
        setHistory([]);  // 还是 render 模态, 显示 empty 状态
      });
    return () => {
      cancelled = true;
    };
  }, [channelID, messageID, onError]);

  // Render container always (so test can find data-testid even pre-fetch).
  return (
    <div
      className="comment-edit-history-modal"
      data-testid="comment-edit-history-modal"
      role="dialog"
      aria-label={COMMENT_EDIT_HISTORY_LABEL.title}
    >
      <header className="comment-edit-history-header">
        <h2 className="comment-edit-history-title">{COMMENT_EDIT_HISTORY_LABEL.title}</h2>
        {history !== null && (
          <p className="comment-edit-history-count">
            {COMMENT_EDIT_HISTORY_LABEL.count.replace('N', String(history.length))}
          </p>
        )}
        <button
          type="button"
          className="comment-edit-history-close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </header>

      {history !== null && history.length === 0 && (
        <p className="comment-edit-history-empty">{COMMENT_EDIT_HISTORY_LABEL.empty}</p>
      )}

      {history !== null && history.length > 0 && (
        <ul className="comment-edit-history-list">
          {history.map((entry, i) => {
            const iso = new Date(entry.ts).toISOString();
            return (
              <li
                key={i}
                data-testid="comment-edit-history-entry"
                data-ts={iso}
                className="comment-edit-history-entry"
              >
                <time dateTime={iso} className="comment-edit-history-ts">
                  {iso}
                </time>
                <pre className="comment-edit-history-old-content">{entry.old_content}</pre>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
