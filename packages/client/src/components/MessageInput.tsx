import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { useAppContext } from '../context/AppContext';
import SlashCommandPicker from './SlashCommandPicker';
import Toolbar from './Toolbar';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { createMentionExtension } from '../extensions/mention';
import { commandRegistry, CommandError } from '../commands/registry';
import type { CommandDefinition, CommandContext } from '../commands/registry';
import '../commands/builtins';
import * as api from '../lib/api';
import { fetchChannelMembers, ApiError } from '../lib/api';
import type { SendStatus } from '../types';

interface Props {
  channelId: string;
  disabled?: boolean;
  disabledHint?: string;
}

function getMarkdownFromEditor(ed: { storage: unknown; getText: () => string }): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mdStorage = (ed.storage as any).markdown as { getMarkdown(): string } | undefined;
  return mdStorage?.getMarkdown() ?? ed.getText();
}

function extractMentionIds(ed: { getJSON: () => { content?: Array<Record<string, unknown>> } }): string[] {
  const ids: string[] = [];
  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'mention' && typeof (node.attrs as Record<string, unknown>)?.id === 'string') {
      ids.push((node.attrs as Record<string, string>).id);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child as Record<string, unknown>);
    }
  };
  const json = ed.getJSON();
  if (json.content) {
    for (const node of json.content) walk(node as Record<string, unknown>);
  }
  return [...new Set(ids)];
}

export default function MessageInput({ channelId, disabled, disabledHint }: Props) {
  const { state, actions, dispatch, sendWsMessage, registerAckTimer } = useAppContext();
  const [text, setText] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [uploading, setUploading] = useState(false);
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

  const mentionUsersRef = useRef(state.users);
  mentionUsersRef.current = isPrivate && channelMemberIds
    ? state.users.filter(u => channelMemberIds.has(u.id))
    : state.users;

  const mentionExtension = useMemo(
    () => createMentionExtension(() => mentionUsersRef.current),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
      mentionExtension,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        'data-placeholder': '输入消息... (Enter 发送, Ctrl+Enter 换行)',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              uploadAndSend(file);
              return true;
            }
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i]!;
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) uploadAndSend(file);
              return true;
            }
          }
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          if (event.ctrlKey || event.metaKey) {
            return false;
          }
          event.preventDefault();
          handleSendRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const newText = getMarkdownFromEditor(ed);
      setText(newText);
      emitTyping();

      if (slashResolvedUser) {
        setSlashResolvedUser(undefined);
      }
    },
  });

  const handleSendRef = useRef<() => void>(() => {});

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
    if (!editor) return;

    const markdown = getMarkdownFromEditor(editor);
    const content = markdown.trim();
    if (!content || sendStatus === 'sending') return;

    setCommandError(null);

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
          editor.commands.clearContent();
          editor.commands.focus();
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

    const mentionIds = extractMentionIds(editor);

    // Replace mention nodes in markdown with <@userId> format
    let finalContent = content;
    const json = editor.getJSON();
    const mentionMap = new Map<string, string>();
    const walkForLabels = (node: Record<string, unknown>) => {
      if (node.type === 'mention') {
        const attrs = node.attrs as Record<string, string>;
        if (attrs.id && attrs.label) {
          mentionMap.set(attrs.label, attrs.id);
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) walkForLabels(child as Record<string, unknown>);
      }
    };
    if (json.content) {
      for (const node of json.content) walkForLabels(node as Record<string, unknown>);
    }
    for (const [label, id] of mentionMap) {
      finalContent = finalContent.replace(new RegExp(`@${escapeRegex(label)}`, 'g'), `<@${id}>`);
    }

    const clientMessageId = crypto.randomUUID();
    dispatch({
      type: 'ADD_PENDING_MESSAGE',
      message: {
        clientMessageId,
        channelId,
        content: finalContent,
        contentType: 'text',
        status: 'pending',
        createdAt: Date.now(),
        senderName: state.currentUser?.display_name ?? 'Unknown',
        senderId: state.currentUser?.id ?? '',
        mentions: mentionIds,
      },
    });

    setText('');
    editor.commands.clearContent();
    editor.commands.focus();

    sendWsMessage({
      type: 'send_message',
      channel_id: channelId,
      content: finalContent,
      content_type: 'text',
      client_message_id: clientMessageId,
      mentions: mentionIds,
    });

    const timer = setTimeout(() => {
      dispatch({ type: 'FAIL_PENDING_MESSAGE', clientMessageId, channelId });
    }, 10_000);
    registerAckTimer(clientMessageId, () => clearTimeout(timer));
  }, [editor, sendStatus, channelId, state.users, state.currentUser, dispatch, sendWsMessage, registerAckTimer, executeCommand, slashResolvedUser]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

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
      editor?.commands.clearContent();
      slash.close();
    } else {
      const newText = `/${cmd.name} `;
      setText(newText);
      editor?.commands.setContent(newText);
      slash.close();
      editor?.commands.focus('end');
    }
  }, [channelId, state.currentUser, dispatch, actions, slash, editor]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (slash.isActive && slash.filtered.length > 0) {
      if (slash.handleKeyDown(e)) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = slash.filtered[slash.selectedIndex];
        if (cmd) handleSlashSelect(cmd);
        return;
      }
    }
  }, [slash, handleSlashSelect]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sendWsMessage({ type: 'typing', channel_id: channelId });
  }, [channelId, sendWsMessage]);

  const insertEmojiAtCursor = useCallback((emoji: string) => {
    editor?.commands.insertContent(emoji);
  }, [editor]);

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
    <div className="message-input-container">
      <SlashCommandPicker
        commands={slash.filtered}
        visible={slash.isActive}
        selectedIndex={slash.selectedIndex}
        onSelect={handleSlashSelect}
      />

      <Toolbar editor={editor} />
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
                editor?.commands.focus();
              }}
              locale="zh"
              previewPosition="none"
            />
          </div>
        )}
        <div className="tiptap-wrapper" onKeyDown={handleEditorKeyDown}>
          <EditorContent editor={editor} />
        </div>
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
