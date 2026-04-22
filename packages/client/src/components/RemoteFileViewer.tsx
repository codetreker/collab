import { ImageViewer } from './viewers/ImageViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { CodeViewer, isCodeFile } from './viewers/CodeViewer';
import { TextViewer } from './viewers/TextViewer';

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RemoteFileViewer({
  name,
  content,
  mimeType,
  size,
  onClose,
}: {
  name: string;
  content: string;
  mimeType: string;
  size: number;
  onClose: () => void;
}) {
  const isMd = name.endsWith('.md');
  const isCode = isCodeFile(name);
  const isImage = mimeType.startsWith('image/');
  const isText = isTextMime(mimeType) || isMd || isCode;

  const renderContent = () => {
    if (isImage) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      return <ImageViewer url={url} name={name} />;
    }
    if (isMd) return <MarkdownViewer content={content} />;
    if (isCode) return <CodeViewer content={content} filename={name} />;
    if (isText) return <TextViewer content={content} />;
    return (
      <div className="file-viewer-binary">
        <p>不支持预览此文件类型</p>
        <p className="file-viewer-meta">{name} · {formatSize(size)}</p>
      </div>
    );
  };

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer-panel" onClick={e => e.stopPropagation()}>
        <div className="file-viewer-header">
          <span className="file-viewer-title">{name}</span>
          <span className="file-viewer-size">{formatSize(size)}</span>
          <button className="file-viewer-close" onClick={onClose}>✕</button>
        </div>
        <div className="file-viewer-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
