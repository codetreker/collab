import { useState, useCallback } from 'react';
import * as api from '../lib/api';
import type { RemoteDirEntry } from '../lib/api';
import { RemoteFileViewer } from './RemoteFileViewer';

interface Props {
  nodeId: string;
  rootPath: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(entry: RemoteDirEntry): string {
  if (entry.isDirectory) return '📁';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (ext === 'md') return '📝';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'css', 'json', 'html', 'xml', 'sql', 'sh', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(ext)) return '📄';
  return '📎';
}

export function RemoteTree({ nodeId, rootPath }: Props) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ name: string; content: string; mimeType: string; size: number } | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([rootPath]);

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.remoteLs(nodeId, dirPath);
      const sorted = [...result.entries].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
      setCurrentPath(dirPath);
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 503) {
        setError('远程节点离线');
      } else {
        setError('加载失败');
      }
      setEntries([]);
    }
    setLoading(false);
  }, [nodeId]);

  useState(() => {
    loadDir(rootPath);
  });

  const handleEntryClick = async (entry: RemoteDirEntry) => {
    const fullPath = currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name;
    if (entry.isDirectory) {
      setPathHistory(prev => [...prev, fullPath]);
      loadDir(fullPath);
    } else {
      try {
        const result = await api.remoteReadFile(nodeId, fullPath);
        setViewingFile({ name: entry.name, content: result.content, mimeType: result.mimeType, size: result.size });
      } catch (err) {
        if (err instanceof api.ApiError) {
          alert(err.status === 413 ? '文件过大，无法预览' : `读取失败: ${err.message}`);
        }
      }
    }
  };

  const handleBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = pathHistory.slice(0, -1);
      setPathHistory(newHistory);
      loadDir(newHistory[newHistory.length - 1]!);
    }
  };

  const breadcrumb = currentPath.replace(rootPath, '').split('/').filter(Boolean);

  return (
    <div className="remote-tree">
      {currentPath !== rootPath && (
        <div className="remote-breadcrumb">
          <span className="remote-breadcrumb-item" onClick={handleBack}>← 上级</span>
          <span className="remote-breadcrumb-path">
            /{breadcrumb.join('/')}
          </span>
        </div>
      )}

      {loading ? (
        <div className="remote-empty">加载中...</div>
      ) : error ? (
        <div className="remote-empty remote-error">{error}</div>
      ) : entries.length === 0 ? (
        <div className="remote-empty">空目录</div>
      ) : (
        <div className="workspace-file-tree">
          {entries.map(entry => (
            <div
              key={entry.name}
              className="workspace-file-item"
              onClick={() => handleEntryClick(entry)}
            >
              <span className="workspace-file-icon">{fileIcon(entry)}</span>
              <span className="workspace-file-name">{entry.name}</span>
              {!entry.isDirectory && (
                <span className="workspace-file-size">{formatSize(entry.size)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingFile && (
        <RemoteFileViewer
          name={viewingFile.name}
          content={viewingFile.content}
          mimeType={viewingFile.mimeType}
          size={viewingFile.size}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
