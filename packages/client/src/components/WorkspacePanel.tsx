import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkspaceFile } from '../types';
import * as api from '../lib/api';
import { FileViewer } from './FileViewer';
import MarkdownEditor from './MarkdownEditor';

interface Props {
  channelId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(file: WorkspaceFile): string {
  if (file.is_directory) return '📁';
  if (file.mime_type?.startsWith('image/')) return '🖼️';
  if (file.name.endsWith('.md')) return '📝';
  if (file.mime_type?.startsWith('text/') || /\.(ts|js|py|css|json|html|xml|sql|sh)$/.test(file.name)) return '📄';
  return '📎';
}

export default function WorkspacePanel({ channelId }: Props) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Root' }]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [editingFile, setEditingFile] = useState<{ file: WorkspaceFile; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: WorkspaceFile } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentParentId = path[path.length - 1]!.id;

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listWorkspaceFiles(channelId, currentParentId ?? undefined);
      setFiles(result);
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [channelId, currentParentId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setPath([{ id: null, name: 'Root' }]);
    setSelectedFile(null);
    setEditingFile(null);
  }, [channelId]);

  const handleFileClick = (file: WorkspaceFile) => {
    if (file.is_directory) {
      setPath(prev => [...prev, { id: file.id, name: file.name }]);
    } else {
      setSelectedFile(file);
    }
  };

  const handleBreadcrumb = (index: number) => {
    setPath(prev => prev.slice(0, index + 1));
  };

  const handleUpload = async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      await api.uploadWorkspaceFile(channelId, file, currentParentId ?? undefined);
    }
    loadFiles();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleMkdir = async () => {
    const name = prompt('文件夹名称：');
    if (!name?.trim()) return;
    await api.mkdirWorkspace(channelId, name.trim(), currentParentId ?? undefined);
    loadFiles();
  };

  const handleDelete = async (file: WorkspaceFile) => {
    if (!confirm(`确定删除 ${file.name}？`)) return;
    await api.deleteWorkspaceFile(channelId, file.id);
    loadFiles();
  };

  const handleContextMenu = (e: React.MouseEvent, file: WorkspaceFile) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleEdit = (file: WorkspaceFile, content: string) => {
    setSelectedFile(null);
    setEditingFile({ file, content });
  };

  const handleSaveEdit = async (content: string) => {
    if (!editingFile) return;
    await api.updateWorkspaceFile(channelId, editingFile.file.id, content);
    setEditingFile(null);
    loadFiles();
  };

  return (
    <div
      className="workspace-panel"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => setContextMenu(null)}
    >
      <div className="workspace-panel-header">
        <h3>Workspace</h3>
        <button className="workspace-btn" onClick={handleMkdir}>新建文件夹</button>
        <button className="workspace-btn" onClick={() => fileInputRef.current?.click()}>上传</button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleUpload(e.target.files)}
        />
      </div>

      {path.length > 1 && (
        <div style={{ padding: '4px 12px', fontSize: '0.8em', color: 'var(--text-secondary)' }}>
          {path.map((p, i) => (
            <span key={i}>
              {i > 0 && ' / '}
              <span
                style={{ cursor: 'pointer', textDecoration: i < path.length - 1 ? 'underline' : 'none' }}
                onClick={() => handleBreadcrumb(i)}
              >
                {p.name}
              </span>
            </span>
          ))}
        </div>
      )}

      {dragging ? (
        <div className="workspace-drop-zone">拖拽文件到此处上传</div>
      ) : loading ? (
        <div className="workspace-empty">加载中...</div>
      ) : files.length === 0 ? (
        <div className="workspace-empty">
          <p>暂无文件</p>
          <p>点击"上传"或拖拽文件到此处</p>
        </div>
      ) : (
        <div className="workspace-file-tree">
          {files.map(file => (
            <div
              key={file.id}
              className="workspace-file-item"
              onClick={() => handleFileClick(file)}
              onContextMenu={e => handleContextMenu(e, file)}
            >
              <span className="workspace-file-icon">{fileIcon(file)}</span>
              <span className="workspace-file-name">{file.name}</span>
              {!file.is_directory && (
                <span className="workspace-file-size">{formatSize(file.size_bytes)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          className="workspace-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.file.is_directory && (
            <div className="workspace-context-menu-item" onClick={() => { handleFileClick(contextMenu.file); setContextMenu(null); }}>
              打开
            </div>
          )}
          <div className="workspace-context-menu-item danger" onClick={() => { handleDelete(contextMenu.file); setContextMenu(null); }}>
            删除
          </div>
        </div>
      )}

      {selectedFile && (
        <FileViewer
          file={selectedFile}
          channelId={channelId}
          onClose={() => setSelectedFile(null)}
          onEdit={selectedFile.name.endsWith('.md') ? handleEdit : undefined}
        />
      )}

      {editingFile && (
        <MarkdownEditor
          initialContent={editingFile.content}
          fileName={editingFile.file.name}
          onSave={handleSaveEdit}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
