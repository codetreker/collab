import React from 'react';
import type { User } from '../types';

interface Props {
  users: User[];
  query: string;
  onSelect: (user: User) => void;
  onDismiss: () => void;
  visible: boolean;
  selectedIndex: number;
}

const isMobile = () => window.innerWidth <= 768;

export default function MentionPicker({ users, query, onSelect, onDismiss, visible, selectedIndex }: Props) {
  if (!visible) return null;

  const q = query.toLowerCase();
  const filtered = users
    .filter(u =>
      u.display_name.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q),
    )
    .slice(0, 10);

  if (filtered.length === 0) return null;

  const picker = (
    <div className="mention-picker">
      {filtered.map((user, idx) => (
        <button
          key={user.id}
          className={`mention-option ${idx === selectedIndex ? 'mention-option-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user);
          }}
        >
          <span className="mention-avatar" style={{ backgroundColor: stringToColor(user.id) }}>
            {user.display_name[0]?.toUpperCase()}
          </span>
          <span className="mention-status-icon">
            {user.role === 'agent' ? '🤖' : '👤'}
          </span>
          <span className="mention-name">{user.display_name}</span>
          <span className="mention-id">({user.id})</span>
          {user.role === 'agent' && <span className="user-badge">Bot</span>}
        </button>
      ))}
    </div>
  );

  if (isMobile()) {
    return (
      <>
        <div className="mention-backdrop" onMouseDown={onDismiss} onTouchStart={onDismiss} />
        {picker}
      </>
    );
  }

  return picker;
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
