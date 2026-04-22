import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

interface Props {
  initialContent: string;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  fileName: string;
}

export default function MarkdownEditor({ initialContent, onSave, onCancel, fileName }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor tiptap-md-editor',
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
    const md = getMarkdown();
    onSave(md);
  }, [getMarkdown, onSave]);

  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    const el = editor.view.dom;
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [editor, onCancel, handleSave]);

  return (
    <div className="file-viewer-overlay" onClick={onCancel}>
      <div className="file-viewer-panel" onClick={e => e.stopPropagation()}>
        <div className="file-viewer-header">
          <span className="file-viewer-title">编辑 {fileName}</span>
          <button className="file-viewer-close" onClick={onCancel}>✕</button>
        </div>
        <div className="markdown-editor">
          <div className="markdown-editor-toolbar">
            <button className="btn-save" onClick={handleSave}>保存</button>
            <button onClick={onCancel}>取消</button>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginLeft: 'auto' }}>
              Ctrl+S 保存 · Esc 取消
            </span>
          </div>
          <div className="markdown-editor-content">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
