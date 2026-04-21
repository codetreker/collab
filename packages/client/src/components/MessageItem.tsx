import React, { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';
import ReactionBar from './ReactionBar';
import type { Message } from '../types';

interface Props {
  message: Message;
  userMap: Map<string, string>;
  currentUserId?: string;
  onRetry?: (message: Message) => void;
}

export default function MessageItem({ message, userMap, currentUserId, onRetry }: Props) {
  const senderName = message.sender_name ?? userMap.get(message.sender_id) ?? 'Unknown';
  const isOwn = message.sender_id === currentUserId;
  const time = formatTime(message.created_at);

  const avatarLetter = senderName[0]?.toUpperCase() ?? '?';
  const avatarColor = stringToColor(message.sender_id);

  const renderedContent = useMemo(() => {
    if (message.content_type === 'image') {
      return null; // Rendered separately
    }
    return renderMarkdown(message.content, message.mentions, userMap);
  }, [message.content, message.content_type, message.mentions, userMap]);

  return (
    <div className={`message-item ${isOwn ? 'message-own' : ''}`}>
      <div className="message-avatar" style={{ backgroundColor: avatarColor }}>
        {avatarLetter}
      </div>
      <div className="message-body">
        <div className="message-header">
          <span className="message-sender">{senderName}</span>
          <span className="message-time">{time}</span>
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
          {message.content_type === 'image' ? (
            <ImageContent url={message.content} />
          ) : (
            <div
              className="message-text"
              dangerouslySetInnerHTML={{ __html: renderedContent! }}
            />
          )}
        </div>
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
      </div>
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
