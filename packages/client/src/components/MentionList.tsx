import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { MentionSuggestionItem, MentionListExtraProps } from '../extensions/mention';

// CHN-2.3 (#357 §1.2 + #354 §1 ⑤) DM-only placeholder lock — byte-identical
// 跟 docs/qa/chn-2-content-lock.md §1 ⑤ 字面 "私信仅限两人, 想加人请新建频道".
// 反约束: 不准 "升级为频道" / "Convert to channel" / "Upgrade DM" 同义词
// (蓝图 §1.2: "想加人就**新建** channel 把双方拉进去" — 是新建, 不是 DM 转换).
//
// Surfaces only when items.length === 0 && channelType === 'dm' — i.e.
// the typing user typed a query in a DM that matches neither of the 2
// DM members. Outside DM context the empty branch returns null (既有
// channel 行为不破).
export const DM_MENTION_THIRD_PARTY_PLACEHOLDER = '私信仅限两人, 想加人请新建频道';

const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SuggestionProps<MentionSuggestionItem> & MentionListExtraProps
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

  if (props.items.length === 0) {
    // CHN-2.3 (#357 §1.2 + #354 §1 ⑤) — DM context with empty match
    // surfaces the locked placeholder. Outside DM we keep既有 channel
    // 行为 (return null) — channel 候选空 = 关闭浮层是正确 UX.
    if (props.channelType === 'dm') {
      return (
        <div
          className="mention-picker mention-picker-dm-empty"
          data-channel-type="dm"
          data-mention-empty="dm-third-party"
        >
          <span className="mention-empty-hint">{DM_MENTION_THIRD_PARTY_PLACEHOLDER}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mention-picker" data-channel-type={props.channelType ?? 'channel'}>
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
