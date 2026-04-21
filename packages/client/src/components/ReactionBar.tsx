import React, { useState, useRef, useEffect } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import * as api from '../lib/api';

interface Reaction {
  emoji: string;
  count: number;
  user_ids: string[];
}

interface Props {
  reactions: Reaction[];
  messageId: string;
  currentUserId?: string;
  userMap: Map<string, string>;
}

export default function ReactionBar({ reactions, messageId, currentUserId, userMap }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current?.contains(e.target as Node)) return;
      if (addBtnRef.current?.contains(e.target as Node)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const handleToggle = async (emoji: string) => {
    const reaction = reactions.find(r => r.emoji === emoji);
    const hasReacted = reaction?.user_ids.includes(currentUserId ?? '');
    try {
      if (hasReacted) {
        await api.removeReaction(messageId, emoji);
      } else {
        await api.addReaction(messageId, emoji);
      }
    } catch {
      // ignore
    }
  };

  const handlePickerSelect = async (emoji: { native: string }) => {
    setPickerOpen(false);
    try {
      await api.addReaction(messageId, emoji.native);
    } catch {
      // ignore
    }
  };

  if (reactions.length === 0 && !pickerOpen) return null;

  return (
    <div className="reaction-bar">
      {reactions.map(r => {
        const isActive = r.user_ids.includes(currentUserId ?? '');
        const names = r.user_ids.map(id => userMap.get(id) ?? id).join(', ');
        return (
          <button
            key={r.emoji}
            className={`reaction-pill ${isActive ? 'reaction-active' : ''}`}
            onClick={() => handleToggle(r.emoji)}
            title={names}
          >
            {r.emoji} {r.count}
          </button>
        );
      })}
      <button
        ref={addBtnRef}
        className="reaction-pill reaction-add"
        onClick={() => setPickerOpen(v => !v)}
        title="添加表情"
      >
        ➕
      </button>
      {pickerOpen && (
        <div className="reaction-picker-popover" ref={pickerRef}>
          <Picker
            data={emojiData}
            onEmojiSelect={handlePickerSelect}
            locale="zh"
            previewPosition="none"
          />
        </div>
      )}
    </div>
  );
}
