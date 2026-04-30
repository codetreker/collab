// ChannelPresenceList — RT-4 channel presence indicator.
// 文案 byte-identical 跟 docs/qa/rt-4-content-lock.md §1.
import React from 'react';

const PRESENCE_AVATAR_LIMIT = 5;

interface Props {
  onlineUserIds: string[];
}

export function ChannelPresenceList({ onlineUserIds }: Props) {
  if (!onlineUserIds || onlineUserIds.length === 0) {
    return null;
  }
  const visible = onlineUserIds.slice(0, PRESENCE_AVATAR_LIMIT);
  const overflow = onlineUserIds.length - PRESENCE_AVATAR_LIMIT;
  return (
    <div
      className="channel-presence-list"
      data-testid="channel-presence-list"
    >
      <span className="channel-presence-count">
        当前在线 {onlineUserIds.length} 人
      </span>
      <ul className="channel-presence-avatars">
        {visible.map((id) => (
          <li
            key={id}
            className="channel-presence-avatar"
            data-presence-user-id={id}
          >
            <span className="channel-presence-dot" aria-hidden="true">●</span>
          </li>
        ))}
        {overflow > 0 && (
          <li
            className="channel-presence-overflow"
            data-testid="channel-presence-overflow"
          >
            +{overflow}
          </li>
        )}
      </ul>
    </div>
  );
}
