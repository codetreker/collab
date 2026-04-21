import React, { useState, useEffect, useCallback } from 'react';
import { deleteChannel } from '../../lib/api';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

interface AdminChannel {
  id: string;
  name: string;
  type: string;
  visibility: string;
  created_at: number;
  deleted_at: number | null;
  member_count?: number;
}

async function fetchAdminChannels(): Promise<AdminChannel[]> {
  const res = await fetch('/api/v1/admin/channels', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load channels');
  const data = await res.json();
  return data.channels;
}

async function forceDeleteChannel(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/channels/${id}/force`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed' }));
    throw new Error(body.error);
  }
}

export default function ChannelsTab() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<{ ch: AdminChannel; force: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminChannels();
      setChannels(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      if (confirmTarget.force) {
        await forceDeleteChannel(confirmTarget.ch.id);
      } else {
        await deleteChannel(confirmTarget.ch.id);
      }
      setConfirmTarget(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Channels</h2>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Visibility</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(ch => (
              <tr key={ch.id} style={{ opacity: ch.deleted_at ? 0.5 : 1 }}>
                <td>{ch.name}</td>
                <td>{ch.type}</td>
                <td>{ch.visibility ?? '—'}</td>
                <td>{ch.deleted_at ? '🗑 Deleted' : '✓ Active'}</td>
                <td>{new Date(ch.created_at).toLocaleString()}</td>
                <td>
                  {!ch.deleted_at && ch.name !== 'general' && ch.type !== 'dm' && (
                    <div className="admin-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmTarget({ ch, force: false })}>Delete</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmTarget({ ch, force: true })}>Force Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmTarget && (
        <ConfirmDeleteModal
          channelName={confirmTarget.ch.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
