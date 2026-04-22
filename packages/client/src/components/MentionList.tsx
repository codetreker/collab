import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { MentionSuggestionItem } from '../extensions/mention';

const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SuggestionProps<MentionSuggestionItem>
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(i => (i + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(i => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, label: item.label } as unknown as MentionSuggestionItem);
    }
  };

  if (props.items.length === 0) return null;

  return (
    <div className="mention-picker">
      {props.items.map((item, idx) => (
        <button
          key={item.id}
          className={`mention-option ${idx === selectedIndex ? 'mention-option-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            selectItem(idx);
          }}
        >
          <span className="mention-avatar" style={{ backgroundColor: stringToColor(item.id) }}>
            {item.label[0]?.toUpperCase()}
          </span>
          <span className="mention-status-icon">
            {item.role === 'agent' ? '🤖' : '👤'}
          </span>
          <span className="mention-name">{item.label}</span>
          <span className="mention-id">({item.id})</span>
          {item.role === 'agent' && <span className="user-badge">Bot</span>}
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
export default MentionList;

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
