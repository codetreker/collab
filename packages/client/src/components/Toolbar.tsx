import React from 'react';
import type { Editor } from '@tiptap/react';

interface Props {
  editor: Editor | null;
}

export default function Toolbar({ editor }: Props) {
  if (!editor) return null;

  const btn = (
    label: string,
    isActive: boolean,
    onClick: () => void,
    title: string,
  ) => (
    <button
      className={`toolbar-btn ${isActive ? 'toolbar-btn-active' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <div className="toolbar">
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Ctrl+B')}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Ctrl+I')}
      {btn('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Ctrl+E')}
      {btn('⊞', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), '```')}
      {btn('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Ctrl+Shift+8')}
      {btn('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ctrl+Shift+9')}
      {btn('"', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), '>')}
    </div>
  );
}
