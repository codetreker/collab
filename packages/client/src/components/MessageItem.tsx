import React, { useMemo, useState, useCallback } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { parseFileLinks } from '../lib/file-links';
import ReactionBar from './ReactionBar';
import EditEditor from './EditEditor';
import FileLink from './FileLink';
import * as api from '../lib/api';
import { useAppContext } from '../context/AppContext';
import { useLongPress } from '../hooks/useLongPress';
import type { Message } from '../types';

interface Props {
  message: Message;
  userMap: Map<string, string>;
  currentUserId?: string;
  currentUserRole?: string;
  onRetry?: (message: Message) => void;
}

export default function MessageItem({ message, userMap, currentUserId, currentUserRole, onRetry }: Props) {
  const { dispatch, state } = useAppContext();
  const isSystem = message.sender_id === 'system';
  const senderName = isSystem ? '系统' : (message.sender_name ?? userMap.get(message.sender_id) ?? 'Unknown');
  const isOwn = message.sender_id === currentUserId;
  const isAdmin = currentUserRole === 'admin';
  const isDeleted = !!message.deleted_at;
  const time = formatTime(message.created_at);

  const avatarLetter = senderName[0]?.toUpperCase() ?? '?';
  const avatarColor = stringToColor(message.sender_id);

  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const renderedContent = useMemo(() => {
    if (message.content_type === 'image') return null;
    let html = renderMarkdown(message.content, message.mentions, userMap);
    html = html.replace(
      /\[workspace:([a-f0-9]+):([^\]]+)\]/g,
      (_match, fileId: string, fileName: string) =>
        `<span class="workspace-ref-card" data-file-id="${fileId}"><span class="workspace-ref-card-name">📎 ${fileName}</span></span>`,
    );
    return html;
  }, [message.content, message.content_type, message.mentions, userMap]);

  const senderUser = state.users.find(u => u.id === message.sender_id);
  const isAgentOwner = senderUser?.role === 'agent' && senderUser.owner_id === currentUserId;
  const agentId = isAgentOwner ? message.sender_id : null;

  const startEdit = useCallback(() => {
    setEditing(true);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const saveEdit = useCallback(async (newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed || trimmed === message.content) {
      cancelEdit();
      return;
    }
    setEditSaving(true);
    try {
      const updated = await api.editMessage(message.id, trimmed);
      dispatch({
        type: 'EDIT_MESSAGE',
        channelId: message.channel_id,
        messageId: message.id,
        content: updated.content,
        editedAt: updated.edited_at!,
      });
      setEditing(false);
    } catch {
      // keep editing on failure
    } finally {
      setEditSaving(false);
    }
  }, [message, dispatch, cancelEdit]);

  const handleDelete = useCallback(async () => {
    try {
      await api.deleteMessage(message.id);
    } catch {
      // ignore
    }
    setShowDeleteConfirm(false);
  }, [message.id]);

  const canEdit = isOwn && !isDeleted && !message._pending && !message._failed;
  const canDelete = (isOwn || isAdmin) && !isDeleted && !message._pending && !message._failed;

  const longPressHandlers = useLongPress(() => {
    if (canEdit || canDelete) setMobileActionsOpen(true);
  });

  if (isSystem) {
    return (
      <div className="message-item message-system">
        <div className="message-system-content">
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: renderedContent! }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`message-item ${isOwn ? 'message-own' : ''}`} {...longPressHandlers}>
      <div className="message-avatar" style={{ backgroundColor: avatarColor }}>
        {avatarLetter}
      </div>
      <div className="message-body">
        <div className="message-header">
          <span className="message-sender">{senderName}</span>
          <span className="message-time">{time}</span>
          {message.edited_at && !isDeleted && (
            <span className="message-edited" title={`已编辑于 ${formatTime(message.edited_at)}`}>
              (已编辑)
            </span>
          )}
          {isOwn && (
            <span className="message-delivery-status">
              {message._pending && '⏳'}
              {message._failed && (
                <>
                  ❌
                  {onRetry && (
                    <button className="retry-btn" onClick={() => onRetry(message)}>重试</button>
                  )}
                </>
              )}
              {!message._pending && !message._failed && <span className="delivery-check">✓</span>}
            </span>
          )}
        </div>
        <div className="message-content">
          {isDeleted ? (
            <div className="message-deleted">此消息已删除</div>
          ) : editing ? (
            <EditEditor
              initialContent={message.content}
              onSave={saveEdit}
              onCancel={cancelEdit}
              disabled={editSaving}
              users={state.users}
            />
          ) : message.content_type === 'image' ? (
            <ImageContent url={message.content} />
          ) : agentId ? (
            <MessageTextWithFileLinks html={renderedContent!} rawContent={message.content} agentId={agentId} />
          ) : (
            <div
              className="message-text"
              dangerouslySetInnerHTML={{ __html: renderedContent! }}
            />
          )}
        </div>
        {!isDeleted && !editing && (
          <>
            {message.reactions && message.reactions.length > 0 ? (
              <ReactionBar
                reactions={message.reactions}
                messageId={message.id}
                currentUserId={currentUserId}
                userMap={userMap}
              />
            ) : (
              !message._pending && !message._failed && (
                <ReactionBar
                  reactions={[]}
                  messageId={message.id}
                  currentUserId={currentUserId}
                  userMap={userMap}
                />
              )
            )}
          </>
        )}
      </div>
      {!isDeleted && !editing && (canEdit || canDelete) && (
        <div className="message-actions">
          {canEdit && (
            <button className="message-action-btn" onClick={startEdit} title="编辑">
              ✏️
            </button>
          )}
          {canDelete && (
            <button className="message-action-btn message-action-delete" onClick={() => setShowDeleteConfirm(true)} title="删除">
              🗑️
            </button>
          )}
        </div>
      )}
      {showDeleteConfirm && (
        <div className="message-delete-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="message-delete-dialog" onClick={e => e.stopPropagation()}>
            <p>确定删除这条消息？</p>
            <div className="message-delete-dialog-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button className="btn-danger" onClick={handleDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
      {mobileActionsOpen && (
        <div className="mobile-action-sheet-overlay" onClick={() => setMobileActionsOpen(false)}>
          <div className="mobile-action-sheet" onClick={e => e.stopPropagation()}>
            {canEdit && (
              <button className="mobile-action-sheet-btn" onClick={() => { setMobileActionsOpen(false); startEdit(); }}>
                ✏️ 编辑
              </button>
            )}
            {canDelete && (
              <button className="mobile-action-sheet-btn mobile-action-sheet-danger" onClick={() => { setMobileActionsOpen(false); setShowDeleteConfirm(true); }}>
                🗑️ 删除
              </button>
            )}
            <button className="mobile-action-sheet-btn mobile-action-sheet-cancel" onClick={() => setMobileActionsOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageTextWithFileLinks({ html, rawContent, agentId }: { html: string; rawContent: string; agentId: string }) {
  const segments = parseFileLinks(rawContent);
  const hasPaths = segments.some(s => s.type === 'path');

  if (!hasPaths) {
    return <div className="message-text" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  const paths = segments.filter(s => s.type === 'path').map(s => s.value);
  const escaped = paths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`);
  const htmlParts = html.split(re);
  const pathSetLower = new Set(paths);

  return (
    <div className="message-text">
      {htmlParts.map((part, i) =>
        pathSetLower.has(part)
          ? <FileLink key={i} path={part} agentId={agentId} />
          : <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
      )}
    </div>
  );
}

function ImageContent({ url }: { url: string }) {
  const [error, setError] = React.useState(false);

  if (error) {
    return (
      <div className="image-error">
        <span>🖼️ 图片加载失败</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="image-fallback-link">
          {url}
        </a>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt="uploaded image"
        className="message-image"
        onError={() => setError(true)}
        loading="lazy"
      />
    </a>
  );
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (isToday) return timeStr;
  if (isYesterday) return `昨天 ${timeStr}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function stringToColor(str: string): string {
  const colors = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
    '#3498db', '#9b59b6', '#e91e63', '#00bcd4', '#ff5722',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}
