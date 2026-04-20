import React, { useState, useEffect, useCallback } from 'react';
import { fetchAdminInvites, createAdminInvite, deleteAdminInvite } from '../../lib/api';
import type { InviteCode } from '../../lib/api';

export default function InvitesTab() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminInvites();
      setInvites(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createAdminInvite(hours ? Number(hours) : undefined, note || undefined);
      setHours('');
      setNote('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (code: string) => {
    try {
      await deleteAdminInvite(code);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Invite Codes</h2>
      </div>

      <div className="admin-card">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 120 }}>
            Expires in (hours, optional)
            <input className="input-field" type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 72" />
          </label>
          <label style={{ flex: 2, minWidth: 200 }}>
            Note (optional)
            <input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="For new hire..." />
          </label>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Generate Code'}
          </button>
        </div>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Note</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map(inv => {
              const isUsed = !!inv.used_by;
              const isExpired = inv.expires_at != null && inv.expires_at < Date.now();
              const status = isUsed ? 'Used' : isExpired ? 'Expired' : 'Active';
              return (
                <tr key={inv.code} style={{ opacity: isUsed || isExpired ? 0.5 : 1 }}>
                  <td>
                    <code>{inv.code}</code>
                    <button className="btn-icon" onClick={() => navigator.clipboard.writeText(inv.code)} title="Copy">📋</button>
                  </td>
                  <td>{inv.note ?? '—'}</td>
                  <td>{status}</td>
                  <td>{inv.expires_at ? new Date(inv.expires_at).toLocaleString() : 'Never'}</td>
                  <td>{new Date(inv.created_at).toLocaleString()}</td>
                  <td>
                    {!isUsed && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(inv.code)}>Revoke</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>No invite codes yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
