import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUserAgents, fetchUsers } from '../api';
import type { AdminUser } from '../api';

export default function UserDetailPage() {
  const { id } = useParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [agents, setAgents] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userId = id ? decodeURIComponent(id) : '';

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchUsers(), fetchUserAgents(userId)]).then(([nextUsers, nextAgents]) => {
      if (!cancelled) {
        setUsers(nextUsers);
        setAgents(nextAgents);
      }
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load user');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const user = useMemo(() => users.find(u => u.id === userId), [users, userId]);

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;
  if (error) return <div className="admin-error">{error}</div>;
  if (!user) return <div className="admin-error">User not found</div>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>{user.display_name}</h2>
        <Link className="btn btn-sm" to="/admin/users">Back</Link>
      </div>
      <div className="admin-card admin-detail-grid">
        <Field label="ID" value={user.id} mono />
        <Field label="Email" value={user.email ?? '-'} />
        <Field label="Role" value={user.role} />
        <Field label="Status" value={user.deleted_at ? 'Deleted' : user.disabled ? 'Disabled' : 'Active'} />
        <Field label="Created" value={formatDate(user.created_at)} />
        <Field label="Last Seen" value={user.last_seen_at ? formatDate(user.last_seen_at) : '-'} />
      </div>
      <div className="admin-section-header"><h2>Agents</h2></div>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id}>
                <td><code className="user-id-cell">{agent.id}</code></td>
                <td>{agent.display_name}</td>
                <td>{agent.deleted_at ? 'Deleted' : agent.disabled ? 'Disabled' : 'Active'}</td>
                <td>{formatDate(agent.created_at)}</td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center' }}>No agents</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="admin-detail-label">{label}</div>
      <div className={mono ? 'admin-detail-value admin-detail-mono' : 'admin-detail-value'}>{value}</div>
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
