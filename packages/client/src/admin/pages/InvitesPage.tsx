import React, { useCallback, useEffect, useState } from 'react';
import { createInvite, deleteInvite, fetchInvites } from '../api';
import type { InviteCode } from '../api';

export default function InvitesPage() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setInvites(await fetchInvites());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createInvite(hours ? Number(hours) : undefined, note || undefined);
      setHours('');
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (code: string) => {
    await deleteInvite(code);
    await load();
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header"><h2>Invites</h2></div>
      {error && <div className="admin-error">{error}</div>}
      <form className="admin-card admin-inline-form" onSubmit={handleCreate}>
        <label>Expires In Hours<input className="input-field" type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="optional" /></label>
        <label>Note<input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></label>
        <button className="btn btn-primary btn-sm" disabled={creating}>{creating ? 'Generating...' : 'Generate'}</button>
      </form>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr><th>Code</th><th>Note</th><th>Status</th><th>Expires</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {invites.map(invite => {
              const used = !!invite.used_by;
              const expired = invite.expires_at != null && invite.expires_at < Date.now();
              return (
                <tr key={invite.code} style={{ opacity: used || expired ? 0.55 : 1 }}>
                  <td><code>{invite.code}</code></td>
                  <td>{invite.note || '-'}</td>
                  <td>{used ? 'Used' : expired ? 'Expired' : 'Active'}</td>
                  <td>{invite.expires_at ? formatDate(invite.expires_at) : 'Never'}</td>
                  <td>{formatDate(invite.created_at)}</td>
                  <td>{!used && <button className="btn btn-sm btn-danger" onClick={() => revoke(invite.code)}>Revoke</button>}</td>
                </tr>
              );
            })}
            {invites.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center' }}>No invite codes</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
