import React, { useState, useRef, useCallback, useEffect } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { useAppContext } from '../context/AppContext';
import MentionPicker from './MentionPicker';
import SlashCommandPicker from './SlashCommandPicker';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useMention } from '../hooks/useMention';
import { commandRegistry, CommandError } from '../commands/registry';
import type { CommandDefinition, CommandContext } from '../commands/registry';
import '../commands/builtins';
import * as api from '../lib/api';
import { fetchChannelMembers, ApiError } from '../lib/api';
import type { User, SendStatus } from '../types';

interface Props {
  channelId: string;
  disabled?: boolean;
  disabledHint?: string;
}

export default function MessageInput({ channelId, disabled, disabledHint }: Props) {
  const { state, actions, dispatch, sendWsMessage, registerAckTimer } = useAppContext();
  const [text, setText] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  const [slashResolvedUser, setSlashResolvedUser] = useState<{ id: string; username: string } | undefined>();

  const channel = state.channels.find(c => c.id === channelId);
  const dmChannel = state.dmChannels.find(dm => dm.id === channelId);
  const isPrivate = !dmChannel && channel?.visibility === 'private';

  const slash = useSlashCommands(text);

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

  const mention = useMention(mentionUsers);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    if (!commandError) return;
    const timer = setTimeout(() => setCommandError(null), 4000);
    return () => clearTimeout(timer);
  }, [commandError]);

  const executeCommand = useCallback(async (name: string, args: string, resolvedUser?: { id: string; username: string }) => {
    const cmd = commandRegistry.get(name);
    if (!cmd) return false;
    const ctx: CommandContext = {
      channelId,
      currentUserId: state.currentUser?.id ?? '',
      args,
      resolvedUser,
      dispatch,
      api,
      actions,
    };
    await cmd.execute(ctx);
    return true;
  }, [channelId, state.currentUser, dispatch, actions]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || sendStatus === 'sending') return;

    setCommandError(null);

    // Slash command interception
    if (content.startsWith('/')) {
      const spaceIdx = content.indexOf(' ');
      const name = spaceIdx === -1 ? content.slice(1) : content.slice(1, spaceIdx);
      const args = spaceIdx === -1 ? '' : content.slice(spaceIdx + 1).trim();
      const cmd = commandRegistry.get(name);
      if (cmd) {
        try {
          await executeCommand(name, args, slashResolvedUser);
          setText('');
          setSlashResolvedUser(undefined);
          textareaRef.current?.focus();
        } catch (err) {
          if (err instanceof CommandError) {
            setCommandError(err.message);
          } else if (err instanceof ApiError) {
            setCommandError(err.message);
          } else {
            setCommandError(err instanceof Error ? err.message : 'Command failed');
          }
        }
        return;
      }
    }

    const mentionIds: string[] = [];
    const mentionRegex = /<@([^>]+)>/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const userId = match[1]!;
      if (state.users.some(u => u.id === userId)) mentionIds.push(userId);
    }

    const clientMessageId = crypto.randomUUID();
    dispatch({
      type: 'ADD_PENDING_MESSAGE',
      message: {
        clientMessageId,
        channelId,
        content,
        contentType: 'text',
        status: 'pending',
        createdAt: Date.now(),
        senderName: state.currentUser?.display_name ?? 'Unknown',
        senderId: state.currentUser?.id ?? '',
        mentions: mentionIds,
      },
    });

    setText('');
    textareaRef.current?.focus();

    sendWsMessage({
      type: 'send_message',
      channel_id: channelId,
      content,
      content_type: 'text',
      client_message_id: clientMessageId,
      mentions: mentionIds,
    });

    const timer = setTimeout(() => {
      dispatch({ type: 'FAIL_PENDING_MESSAGE', clientMessageId, channelId });
    }, 10_000);
    registerAckTimer(clientMessageId, () => clearTimeout(timer));
  }, [text, sendStatus, channelId, state.users, state.currentUser, dispatch, sendWsMessage, registerAckTimer, executeCommand]);

  const handleSlashSelect = useCallback(async (cmd: CommandDefinition) => {
    if (cmd.paramType === 'none') {
      const ctx: CommandContext = {
        channelId,
        currentUserId: state.currentUser?.id ?? '',
        args: '',
        dispatch,
        api,
        actions,
      };
      try {
        await cmd.execute(ctx);
      } catch (err) {
        if (err instanceof CommandError || err instanceof ApiError) {
          setCommandError(err.message);
        } else {
          setCommandError(err instanceof Error ? err.message : 'Command failed');
        }
      }
      setText('');
      slash.close();
    } else {
      setText(`/${cmd.name} `);
      slash.close();
      textareaRef.current?.focus();
    }
  }, [channelId, state.currentUser, dispatch, actions, slash]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (slash.isActive && slash.filtered.length > 0) {
      if (slash.handleKeyDown(e)) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = slash.filtered[slash.selectedIndex];
        if (cmd) handleSlashSelect(cmd);
        return;
      }
    }

    if (mention.visible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mention.setIndex(i => Math.min(i + 1, mention.filteredUsers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mention.setIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mention.filteredUsers[mention.index]) {
          handleInsertMention(mention.filteredUsers[mention.index]);
        }
        return;
      }
      if (e.key === 'Escape') {
        mention.setVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [slash, handleSlashSelect, mention.visible, mention.filteredUsers, mention.index, handleSend]);

  const handleInsertMention = (user: User) => {
    const slashMatch = text.match(/^\/(\w+)\s/);
    if (slashMatch) {
      const cmd = commandRegistry.get(slashMatch[1]!);
      if (cmd && cmd.paramType === 'user') {
        setText(`/${cmd.name} @${user.display_name}`);
        mention.reset();
        setSlashResolvedUser({ id: user.id, username: user.display_name });
        return;
      }
    }

    const { newText, cursorPos } = mention.insertMention(user, text, textareaRef.current?.selectionStart ?? text.length);
    setText(newText);
    mention.reset();

    setTimeout(() => {
      textareaRef.current?.setSelectionRange(cursorPos, cursorPos);
      textareaRef.current?.focus();
    }, 0);
  };

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sendWsMessage({ type: 'typing', channel_id: channelId });
  }, [channelId, sendWsMessage]);

  const insertEmojiAtCursor = useCallback((emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  }, [text]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current?.contains(e.target as Node)) return;
      if (emojiBtnRef.current?.contains(e.target as Node)) return;
      setEmojiPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiPickerOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    emitTyping();

    if (slashResolvedUser) {
      setSlashResolvedUser(undefined);
    }

    // Slash commands take priority over mentions
    if (value.startsWith('/') && !value.includes(' ')) {
      mention.setVisible(false);
      return;
    }

    // User-param slash command argument phase
    const slashUserMatch = value.match(/^\/(\w+)\s(.*)$/);
    if (slashUserMatch) {
      const cmd = commandRegistry.get(slashUserMatch[1]!);
      if (cmd && cmd.paramType === 'user') {
        const argText = slashUserMatch[2]!;
        const q = argText.replace(/^@/, '');
        mention.handleChange(`@${q}`, q.length + 1);
        return;
      }
    }

    // Check for @ mention trigger
    const cursorPos = e.target.selectionStart;
    if (!mention.handleChange(value, cursorPos)) {
      // handleChange returns null when no mention detected — already sets visible=false
    }
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
      const clientMessageId = crypto.randomUUID();
      dispatch({
        type: 'ADD_PENDING_MESSAGE',
        message: {
          clientMessageId,
          channelId,
          content: url,
          contentType: 'image',
          status: 'pending',
          createdAt: Date.now(),
          senderName: state.currentUser?.display_name ?? 'Unknown',
          senderId: state.currentUser?.id ?? '',
        },
      });
      sendWsMessage({
        type: 'send_message',
        channel_id: channelId,
        content: url,
        content_type: 'image',
        client_message_id: clientMessageId,
      });
      const timer = setTimeout(() => {
        dispatch({ type: 'FAIL_PENDING_MESSAGE', clientMessageId, channelId });
      }, 10_000);
      registerAckTimer(clientMessageId, () => clearTimeout(timer));
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

  // Determine active command for placeholder
  const activeCommandPlaceholder = (() => {
    const m = text.match(/^\/(\w+)\s/);
    if (!m) return null;
    const cmd = commandRegistry.get(m[1]!);
    if (cmd && cmd.paramType === 'text' && !text.slice(m[0].length).trim()) {
      return cmd.placeholder ?? `输入 ${cmd.name} 参数…`;
    }
    return null;
  })();

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
      <SlashCommandPicker
        commands={slash.filtered}
        visible={slash.isActive}
        selectedIndex={slash.selectedIndex}
        onSelect={handleSlashSelect}
      />
      <MentionPicker
        users={mentionUsers}
        query={mention.query}
        onSelect={handleInsertMention}
        onDismiss={() => mention.setVisible(false)}
        visible={mention.visible}
        selectedIndex={mention.index}
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
        <button
          ref={emojiBtnRef}
          className="icon-btn emoji-btn"
          onClick={() => setEmojiPickerOpen(v => !v)}
          title="选择表情"
        >
          😊
        </button>
        {emojiPickerOpen && (
          <div className="emoji-picker-popover" ref={emojiPickerRef}>
            <Picker
              data={emojiData}
              onEmojiSelect={(emoji: { native: string }) => {
                insertEmojiAtCursor(emoji.native);
                setEmojiPickerOpen(false);
                textareaRef.current?.focus();
              }}
              locale="zh"
              previewPosition="none"
            />
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="message-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={activeCommandPlaceholder ?? "输入消息... (Enter 发送, Shift+Enter 换行)"}
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

      {commandError && (
        <div className="send-status send-status-error">{commandError}</div>
      )}
      {statusText() && (
        <div className={`send-status ${sendStatus === 'error' ? 'send-status-error' : ''}`}>
          {statusText()}
        </div>
      )}
    </div>
  );
}
