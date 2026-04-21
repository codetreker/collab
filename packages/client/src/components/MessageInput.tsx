import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import MentionPicker from './MentionPicker';
import * as api from '../lib/api';
import { fetchChannelMembers } from '../lib/api';
import type { User, SendStatus } from '../types';

interface Props {
  channelId: string;
  disabled?: boolean;
  disabledHint?: string;
}

export default function MessageInput({ channelId, disabled, disabledHint }: Props) {
  const { state, actions, sendWsMessage } = useAppContext();
  const [text, setText] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  const channel = state.channels.find(c => c.id === channelId);
  const dmChannel = state.dmChannels.find(dm => dm.id === channelId);
  const isPrivate = !dmChannel && channel?.visibility === 'private';

  const [channelMemberIds, setChannelMemberIds] = useState<Set<string> | null>(null);

  const membersVersion = state.channelMembersVersion.get(channelId) ?? 0;

  useEffect(() => {
    if (!isPrivate) {
      setChannelMemberIds(null);
      return;
    }
    let cancelled = false;
    fetchChannelMembers(channelId).then(members => {
      if (!cancelled) setChannelMemberIds(new Set(members.map(m => m.user_id)));
    });
    return () => { cancelled = true; };
  }, [channelId, isPrivate, membersVersion]);

  const mentionUsers = isPrivate && channelMemberIds
    ? state.users.filter(u => channelMemberIds.has(u.id))
    : state.users;

  const filteredUsers = mentionUsers.filter(u =>
    u.display_name.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || sendStatus === 'sending') return;

    // Extract mention user IDs from <@user_id> tokens in content
    const mentionIds: string[] = [];
    const mentionRegex = /<@([^>]+)>/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const userId = match[1]!;
      if (state.users.some(u => u.id === userId)) mentionIds.push(userId);
    }

    setSendStatus('sending');
    try {
      await actions.sendMessage(channelId, content, 'text', mentionIds);
      setText('');
      setSendStatus('sent');
      setTimeout(() => setSendStatus('idle'), 1000);
      textareaRef.current?.focus();
    } catch {
      setSendStatus('error');
      setTimeout(() => setSendStatus('idle'), 3000);
    }
  }, [text, sendStatus, channelId, actions, state.users]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mentionVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredUsers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredUsers[mentionIndex]) {
          insertMention(filteredUsers[mentionIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setMentionVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [mentionVisible, filteredUsers, mentionIndex, handleSend]);

  const insertMention = (user: User) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(textareaRef.current?.selectionStart ?? text.length);
    const mentionToken = `<@${user.id}>`;
    const newText = `${before}${mentionToken} ${after}`;
    setText(newText);
    setMentionVisible(false);
    setMentionQuery('');
    setMentionIndex(0);

    setTimeout(() => {
      const pos = before.length + mentionToken.length + 1;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  };

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sendWsMessage({ type: 'typing', channel_id: channelId });
  }, [channelId, sendWsMessage]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    emitTyping();

    // Check for @ mention trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(' ')) {
          setMentionStart(atIndex);
          setMentionQuery(query);
          setMentionVisible(true);
          setMentionIndex(0);
          return;
        }
      }
    }
    setMentionVisible(false);
  };

  // Image upload handling
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadAndSend(file);
        return;
      }
    }
  }, [channelId]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.type.startsWith('image/')) {
        await uploadAndSend(file);
        return;
      }
    }
  }, [channelId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const uploadAndSend = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      await actions.sendMessage(channelId, url, 'image');
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await uploadAndSend(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const statusText = () => {
    if (uploading) return '上传中...';
    switch (sendStatus) {
      case 'sending': return '发送中...';
      case 'error': return '发送失败';
      default: return null;
    }
  };

  if (disabled) {
    return (
      <div className="message-input-container">
        <div className="message-input-disabled">
          {disabledHint ?? '无法发送消息'}
        </div>
      </div>
    );
  }

  return (
    <div className="message-input-container" onDrop={handleDrop} onDragOver={handleDragOver}>
      <MentionPicker
        users={mentionUsers}
        query={mentionQuery}
        onSelect={insertMention}
        visible={mentionVisible}
        selectedIndex={mentionIndex}
      />

      <div className="message-input-row">
        <button
          className="icon-btn upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title="上传图片"
          disabled={uploading}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <textarea
          ref={textareaRef}
          className="message-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={sendStatus === 'sending'}
        />
        <button
          className="btn btn-primary send-btn"
          onClick={handleSend}
          disabled={!text.trim() || sendStatus === 'sending'}
        >
          发送
        </button>
      </div>

      {statusText() && (
        <div className={`send-status ${sendStatus === 'error' ? 'send-status-error' : ''}`}>
          {statusText()}
        </div>
      )}
    </div>
  );
}
