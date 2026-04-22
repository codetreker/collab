import { renderMarkdown } from '../../lib/markdown';

export function MarkdownViewer({
  content,
  onEdit,
}: {
  content: string;
  onEdit?: () => void;
}) {
  const html = renderMarkdown(content);

  return (
    <div className="markdown-viewer">
      {onEdit && (
        <div className="markdown-viewer-toolbar">
          <button className="btn-edit-md" onClick={onEdit}>编辑</button>
        </div>
      )}
      <div
        className="markdown-viewer-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
