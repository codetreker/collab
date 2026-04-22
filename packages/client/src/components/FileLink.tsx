import { useState } from 'react';
import * as api from '../lib/api';
import { RemoteFileViewer } from './RemoteFileViewer';

interface Props {
  path: string;
  agentId: string;
}

export default function FileLink({ path, agentId }: Props) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<api.AgentFileResponse | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.getAgentFile(agentId, path);
      setFile(res);
    } catch (err) {
      const status = err instanceof api.ApiError ? err.status : 0;
      const message = err instanceof api.ApiError ? err.message : 'Unknown error';
      if (status === 503) {
        alert('Agent 离线，无法读取文件');
      } else if (status === 504) {
        alert('文件读取超时');
      } else if (status === 403) {
        alert(message === 'path_not_allowed' ? '该路径不在允许读取范围' : message);
      } else if (status === 404) {
        alert('文件不存在');
      } else if (status === 413) {
        alert('文件过大，无法预览');
      } else {
        alert(`读取失败: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fileName = path.split('/').pop() ?? path;

  return (
    <>
      <span
        className={`file-link ${loading ? 'file-link-loading' : ''}`}
        onClick={handleClick}
        title={path}
      >
        {fileName}
      </span>
      {file && (
        <RemoteFileViewer
          name={fileName}
          content={file.content}
          mimeType={file.mime_type}
          size={file.size}
          onClose={() => setFile(null)}
        />
      )}
    </>
  );
}
