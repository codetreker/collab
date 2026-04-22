import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';
import type { RemoteBinding } from '../lib/api';
import { RemoteTree } from './RemoteTree';

interface Props {
  channelId: string;
}

export default function RemotePanel({ channelId }: Props) {
  const [bindings, setBindings] = useState<RemoteBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBinding, setSelectedBinding] = useState<RemoteBinding | null>(null);

  const loadBindings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.fetchChannelRemoteBindings(channelId);
      setBindings(result);
    } catch {
      setBindings([]);
    }
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    loadBindings();
    setSelectedBinding(null);
  }, [loadBindings]);

  if (loading) {
    return <div className="remote-panel"><div className="remote-empty">加载中...</div></div>;
  }

  if (bindings.length === 0) {
    return (
      <div className="remote-panel">
        <div className="remote-empty">
          <p>暂无远程目录绑定</p>
          <p style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>
            在 Node 管理中绑定远程目录到此频道
          </p>
        </div>
      </div>
    );
  }

  if (selectedBinding) {
    return (
      <div className="remote-panel">
        <div className="remote-panel-header">
          <button className="remote-back-btn" onClick={() => setSelectedBinding(null)}>← 返回</button>
          <span className="remote-panel-title">
            {selectedBinding.machine_name} : {selectedBinding.label || selectedBinding.path}
          </span>
          <button className="workspace-btn" onClick={loadBindings} title="刷新">↻</button>
        </div>
        <RemoteTree nodeId={selectedBinding.node_id} rootPath={selectedBinding.path} />
      </div>
    );
  }

  return (
    <div className="remote-panel">
      <div className="remote-panel-header">
        <h3>Remote</h3>
        <button className="workspace-btn" onClick={loadBindings} title="刷新">↻</button>
      </div>
      <div className="remote-binding-list">
        {bindings.map(b => (
          <div
            key={b.id}
            className="remote-binding-item"
            onClick={() => setSelectedBinding(b)}
          >
            <span className="remote-binding-icon">🖥️</span>
            <div className="remote-binding-info">
              <div className="remote-binding-name">{b.label || b.path}</div>
              <div className="remote-binding-meta">{b.machine_name} · {b.path}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
