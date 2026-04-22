import { useState } from 'react';
import * as api from '../lib/api';
import { useToast } from './Toast';
import { RemoteFileViewer } from './RemoteFileViewer';

interface Props {
  path: string;
  agentId: string;
}

export default function FileLink({ path, agentId }: Props) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<api.AgentFileResponse | null>(null);
  const [disabled, setDisabled] = useState(false);
  const { showToast } = useToast();

  const handleClick = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const res = await api.getAgentFile(agentId, path);
      setFile(res);
    } catch (err) {
      const status = err instanceof api.ApiError ? err.status : 0;
      const errorCode = err instanceof api.ApiError ? err.message : '';
      if (status === 503) {
        showToast('Agent 离线，无法读取文件');
        setDisabled(true);
      } else if (status === 504) {
        showToast('文件读取超时');
      } else if (status === 403 && errorCode === 'path_not_allowed') {
        showToast('该路径不在允许读取范围');
      } else if (status === 404) {
        showToast('文件不存在');
      } else if (status === 413) {
        showToast('文件过大，无法预览');
      } else {
        showToast(`读取失败: ${errorCode}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fileName = path.split('/').pop() ?? path;
  const className = `file-link${loading ? ' file-link-loading' : ''}${disabled ? ' file-link-disabled' : ''}`;

  return (
    <>
      <span
        className={className}
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
