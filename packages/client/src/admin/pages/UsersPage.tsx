import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createUser, deleteUser, fetchUsers, patchUser } from '../api';
import type { AdminUser } from '../api';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDisabled = async (user: AdminUser, disabled: boolean) => {
    await patchUser(user.id, { disabled });
    await load();
  };

  const remove = async (user: AdminUser) => {
    if (!confirm(`Delete user "${user.display_name}"?`)) return;
    await deleteUser(user.id);
    await load();
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Users</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create User</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ opacity: user.deleted_at || user.disabled ? 0.55 : 1 }}>
                <td><code className="user-id-cell">{user.id}</code></td>
                <td><Link to={`/admin/users/${encodeURIComponent(user.id)}`}>{user.display_name}</Link></td>
                <td>{user.email ?? '-'}</td>
                <td><span className={`role-badge role-${user.role}`}>{user.role}</span></td>
                <td>{user.deleted_at ? 'Deleted' : user.disabled ? 'Disabled' : 'Active'}</td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  {!user.deleted_at && user.role !== 'admin' && (
                    <div className="admin-actions">
                      {user.disabled ? (
                        <button className="btn btn-sm" onClick={() => setDisabled(user, false)}>Enable</button>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setDisabled(user, true)}>Disable</button>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => remove(user)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createUser({ id: id || undefined, email, password, display_name: displayName });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <h3>Create User</h3>
        <form onSubmit={handleSubmit}>
          <label>User ID<input className="input-field" value={id} onChange={e => setId(e.target.value)} placeholder="optional" /></label>
          <label>Display Name<input className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} required /></label>
          <label>Email<input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Password<input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" disabled={saving || !displayName || !email || !password}>{saving ? 'Creating...' : 'Create'}</button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
