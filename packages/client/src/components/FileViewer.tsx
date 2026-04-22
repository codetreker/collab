import { useState, useEffect, useCallback } from 'react';
import type { WorkspaceFile } from '../types';
import * as api from '../lib/api';
import { ImageViewer } from './viewers/ImageViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { CodeViewer, isCodeFile } from './viewers/CodeViewer';
import { TextViewer } from './viewers/TextViewer';

function isTextMime(mime: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml';
}

export function FileViewer({
  file,
  channelId,
  onClose,
  onEdit,
}: {
  file: WorkspaceFile;
  channelId: string;
  onClose: () => void;
  onEdit?: (file: WorkspaceFile, content: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isImage = file.mime_type?.startsWith('image/');
  const isMd = file.name.endsWith('.md');
  const isCode = isCodeFile(file.name);
  const isText = isTextMime(file.mime_type) || isMd || isCode;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.downloadWorkspaceFile(channelId, file.id);
      if (isImage) {
        const blob = await res.blob();
        setBlobUrl(URL.createObjectURL(blob));
      } else if (isText) {
        setContent(await res.text());
      }
    } catch {
      setError('Failed to load file');
    }
    setLoading(false);
  }, [channelId, file.id, isImage, isText]);

  useEffect(() => {
    load();
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [load]);

  const handleEdit = () => {
    if (onEdit && content !== null) onEdit(file, content);
  };

  const renderContent = () => {
    if (loading) return <div className="file-viewer-loading">加载中...</div>;
    if (error) return <div className="file-viewer-error">{error}</div>;

    if (isImage && blobUrl) {
      return <ImageViewer url={blobUrl} name={file.name} />;
    }
    if (isMd && content !== null) {
      return <MarkdownViewer content={content} onEdit={onEdit ? handleEdit : undefined} />;
    }
    if (isCode && content !== null) {
      return <CodeViewer content={content} filename={file.name} />;
    }
    if (isText && content !== null) {
      return <TextViewer content={content} />;
    }

    return (
      <div className="file-viewer-binary">
        <p>不支持预览此文件类型</p>
        <p className="file-viewer-meta">{file.name} · {formatSize(file.size_bytes)}</p>
      </div>
    );
  };

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer-panel" onClick={e => e.stopPropagation()}>
        <div className="file-viewer-header">
          <span className="file-viewer-title">{file.name}</span>
          <span className="file-viewer-size">{formatSize(file.size_bytes)}</span>
          <button className="file-viewer-close" onClick={onClose}>✕</button>
        </div>
        <div className="file-viewer-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
