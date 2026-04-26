import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchChannelMembers } from '../lib/api';
import type { ChannelMember } from '../lib/api';

const MAX_RESULTS = 10;

interface UseMentionResult {
  query: string;
  visible: boolean;
  index: number;
  start: number;
  filteredUsers: ChannelMember[];
  setIndex: (i: number | ((prev: number) => number)) => void;
  setVisible: (v: boolean) => void;
  handleChange: (value: string, cursorPos: number) => 'mention' | null;
  insertMention: (user: ChannelMember, text: string, selectionStart: number) => { newText: string; cursorPos: number };
  reset: () => void;
}

const membersCache = new Map<string, ChannelMember[]>();

export function useMention(channelId: string | null): UseMentionResult {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [start, setStart] = useState(-1);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const activeChannelRef = useRef(channelId);
  activeChannelRef.current = channelId;

  useEffect(() => {
    if (!channelId) {
      setMembers([]);
      return;
    }

    setMembers(membersCache.get(channelId) ?? []);
    let cancelled = false;
    fetchChannelMembers(channelId).then(next => {
      membersCache.set(channelId, next);
      if (!cancelled && activeChannelRef.current === channelId) {
        setMembers(next);
      }
    }).catch(() => {
      if (!cancelled && activeChannelRef.current === channelId) {
        setMembers([]);
      }
    });
    return () => { cancelled = true; };
  }, [channelId]);

  const filteredUsers = members
    .filter(u => {
      const q = query.toLowerCase();
      return u.display_name.toLowerCase().startsWith(q);
    })
    .slice(0, MAX_RESULTS);

  const handleChange = useCallback((value: string, cursorPos: number): 'mention' | null => {
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const q = textBeforeCursor.slice(atIndex + 1);
        if (!q.includes(' ')) {
          setStart(atIndex);
          setQuery(q);
          setVisible(true);
          setIndex(0);
          return 'mention';
        }
      }
    }
    setVisible(false);
    return null;
  }, []);

  const insertMention = useCallback((user: ChannelMember, text: string, selectionStart: number) => {
    const before = text.slice(0, start);
    const after = text.slice(selectionStart);
    const mentionToken = `<@${user.user_id}>`;
    const newText = `${before}${mentionToken} ${after}`;
    const cursorPos = before.length + mentionToken.length + 1;
    return { newText, cursorPos };
  }, [start]);

  const reset = useCallback(() => {
    setVisible(false);
    setQuery('');
    setIndex(0);
  }, []);

  return { query, visible, index, start, filteredUsers, setIndex, setVisible, handleChange, insertMention, reset };
}
