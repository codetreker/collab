import React, { useState, useRef, useCallback } from 'react';
import type { User } from '../types';

interface Props {
  users: User[];
  query: string;
  onSelect: (user: User) => void;
  position: { top: number; left: number };
  visible: boolean;
  selectedIndex: number;
}

export default function MentionPicker({ users, query, onSelect, position, visible, selectedIndex }: Props) {
  if (!visible || users.length === 0) return null;

  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(query.toLowerCase()),
  );

  if (filtered.length === 0) return null;

  return (
    <div
      className="mention-picker"
      style={{ bottom: position.top, left: position.left }}
    >
      {filtered.map((user, idx) => (
        <button
          key={user.id}
          className={`mention-option ${idx === selectedIndex ? 'mention-option-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent input blur
            onSelect(user);
          }}
        >
          <span className="mention-avatar" style={{ backgroundColor: stringToColor(user.id) }}>
            {user.display_name[0]?.toUpperCase()}
          </span>
          <span className="mention-name">{user.display_name}</span>
          {user.role === 'agent' && <span className="user-badge">Bot</span>}
        </button>
      ))}
    </div>
  );
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
