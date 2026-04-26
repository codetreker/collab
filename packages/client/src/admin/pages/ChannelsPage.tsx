import React, { useCallback, useEffect, useState } from 'react';
import { fetchChannels, forceDeleteChannel } from '../api';
import type { AdminChannel } from '../api';

export default function ChannelsPage() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setChannels(await fetchChannels());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (channel: AdminChannel) => {
    if (!confirm(`Force delete #${channel.name}?`)) return;
    await forceDeleteChannel(channel.id);
    await load();
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header"><h2>Channels</h2></div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Visibility</th><th>Members</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {channels.map(channel => (
              <tr key={channel.id} style={{ opacity: channel.deleted_at ? 0.55 : 1 }}>
                <td>{channel.type === 'dm' ? channel.name : `#${channel.name}`}</td>
                <td>{channel.type}</td>
                <td>{channel.visibility ?? '-'}</td>
                <td>{channel.member_count ?? '-'}</td>
                <td>{channel.deleted_at ? 'Deleted' : 'Active'}</td>
                <td>{formatDate(channel.created_at)}</td>
                <td>
                  {!channel.deleted_at && channel.name !== 'general' && channel.type !== 'dm' && (
                    <button className="btn btn-sm btn-danger" onClick={() => remove(channel)}>Force Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
