import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { createMentionExtension } from '../extensions/mention';
import type { ChannelMember } from '../lib/api';

interface Props {
  initialContent: string;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  users: ChannelMember[];
}

export default function EditEditor({ initialContent, onSave, onCancel, disabled, users }: Props) {
  const usersRef = useRef(users);
  usersRef.current = users;

  const mentionExtension = useMemo(
    () => createMentionExtension(() => usersRef.current),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
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
        class: 'tiptap-editor tiptap-edit-editor',
      },
    },
  });

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
      editor.commands.focus('end');
    }
  }, [editor, initialContent]);

  const getMarkdown = useCallback(() => {
    if (!editor) return '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdStorage = (editor.storage as any).markdown as { getMarkdown(): string } | undefined;
    return mdStorage?.getMarkdown() ?? editor.getText();
  }, [editor]);

  const handleSave = useCallback(() => {
    const md = getMarkdown().trim();
    if (md) onSave(md);
  }, [getMarkdown, onSave]);

  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    const el = editor.view.dom;
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [editor, onCancel, handleSave]);

  return (
    <div className="message-edit-container">
      <div className="tiptap-wrapper tiptap-edit-wrapper">
        <EditorContent editor={editor} />
      </div>
      <div className="message-edit-hint">
        Ctrl+Enter 保存 · Esc 取消
        {disabled && ' · 保存中...'}
      </div>
    </div>
  );
}
