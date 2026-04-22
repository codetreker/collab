import { useState, useEffect } from 'react';
import type { WorkspaceFile } from '../types';
import * as api from '../lib/api';
import { FileViewer } from './FileViewer';

interface Props {
  onBack: () => void;
}

export default function WorkspaceManager({ onBack }: Props) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);

  useEffect(() => {
    api.fetchAllWorkspaces().then(f => {
      setFiles(f);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const channels = [...new Map(files.map(f => [f.channel_id, f.channel_name ?? f.channel_id])).entries()];
  const filteredFiles = selectedChannel ? files.filter(f => f.channel_id === selectedChannel) : files;

  return (
    <div className="workspace-manager">
      <div className="workspace-manager-sidebar">
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="workspace-btn" onClick={onBack}>← 返回</button>
          <h3 style={{ margin: 0 }}>Workspaces</h3>
        </div>
        <div
          className={`workspace-manager-channel${!selectedChannel ? ' active' : ''}`}
          onClick={() => setSelectedChannel(null)}
        >
          全部频道
        </div>
        {channels.map(([id, name]) => (
          <div
            key={id}
            className={`workspace-manager-channel${selectedChannel === id ? ' active' : ''}`}
            onClick={() => setSelectedChannel(id)}
          >
            # {name}
          </div>
        ))}
      </div>
      <div className="workspace-manager-main">
        {loading ? (
          <div className="workspace-empty">加载中...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="workspace-empty">暂无文件</div>
        ) : (
          <div className="workspace-file-tree">
            {filteredFiles.map(file => (
              <div
                key={file.id}
                className="workspace-file-item"
                onClick={() => !file.is_directory && setSelectedFile(file)}
              >
                <span className="workspace-file-icon">{file.is_directory ? '📁' : '📄'}</span>
                <span className="workspace-file-name">{file.name}</span>
                {file.channel_name && !selectedChannel && (
                  <span className="workspace-file-size">#{file.channel_name}</span>
                )}
                {!file.is_directory && (
                  <span className="workspace-file-size">{formatSize(file.size_bytes)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedFile && (
        <FileViewer
          file={selectedFile}
          channelId={selectedFile.channel_id}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
