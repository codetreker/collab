import React, { useState, useEffect, useCallback } from 'react';
import type { AdminUser } from '../../types';
import {
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  generateApiKey,
  deleteApiKey,
  patchAdminUser,
} from '../../lib/api';

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      const u = await fetchAdminUsers();
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Delete user "${user.display_name}"? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(user.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDisable = async (user: AdminUser) => {
    try {
      await patchAdminUser(user.id, { disabled: true });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleEnable = async (user: AdminUser) => {
    try {
      await patchAdminUser(user.id, { disabled: false });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleGenerateKey = async (userId: string) => {
    try {
      const { api_key } = await generateApiKey(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, api_key } : u));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDeleteKey = async (userId: string) => {
    try {
      await deleteApiKey(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, api_key: null } : u));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const maskKey = (key: string) => key.length <= 12 ? key : `${key.slice(0, 8)}...${key.slice(-4)}`;

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Users</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create User</button>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>API Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ opacity: (user as any).disabled ? 0.5 : 1 }}>
                <td><code>{user.id.slice(0, 8)}</code></td>
                <td>{user.display_name}</td>
                <td>{user.email ?? '—'}</td>
                <td><span className={`role-badge role-${user.role}`}>{user.role}</span></td>
                <td>{(user as any).deleted_at ? '🗑 Deleted' : (user as any).disabled ? '⛔ Disabled' : '✓ Active'}</td>
                <td>
                  {user.api_key ? (
                    <div className="api-key-display">
                      <code>{maskKey(user.api_key)}</code>
                      <button className="btn-icon" onClick={() => navigator.clipboard.writeText(user.api_key!)} title="Copy">📋</button>
                      <button className="btn-icon" onClick={() => handleGenerateKey(user.id)} title="Regenerate">🔄</button>
                      <button className="btn-icon" onClick={() => handleDeleteKey(user.id)} title="Revoke">✕</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm" onClick={() => handleGenerateKey(user.id)}>Generate</button>
                  )}
                </td>
                <td>
                  <div className="admin-actions">
                    <button className="btn btn-sm" onClick={() => setEditUser(user)}>Edit</button>
                    {!(user as any).disabled && !(user as any).deleted_at && (
                      <button className="btn btn-sm" onClick={() => handleDisable(user)}>Disable</button>
                    )}
                    {(user as any).disabled && !(user as any).deleted_at && (
                      <button className="btn btn-sm" onClick={() => handleEnable(user)}>Enable</button>
                    )}
                    {!(user as any).deleted_at && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onUpdated={() => { setEditUser(null); load(); }} />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [customId, setCustomId] = useState('');
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isAgent = role === 'agent';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createAdminUser({
        id: customId || undefined,
        email: isAgent ? undefined : email,
        password: isAgent ? undefined : password,
        display_name: displayName,
        role,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <h3>Create User</h3>
        <form onSubmit={handleSubmit}>
          <label>User ID (optional)<input className="input-field" value={customId} onChange={e => setCustomId(e.target.value)} /></label>
          <label>Display Name<input className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} required /></label>
          {!isAgent && (
            <>
              <label>Email<input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
              <label>Password<input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            </>
          )}
          <label>Role
            <select className="input-field" value={role} onChange={e => setRole(e.target.value)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="agent">agent</option>
            </select>
          </label>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onUpdated }: { user: AdminUser; onClose: () => void; onUpdated: () => void }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data: Record<string, string> = {};
      if (displayName !== user.display_name) data.display_name = displayName;
      if (password) data.password = password;
      if (role !== user.role) data.role = role;
      await updateAdminUser(user.id, data);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <h3>Edit User</h3>
        <form onSubmit={handleSubmit}>
          <label>ID<input className="input-field" value={user.id} readOnly style={{ opacity: 0.7 }} /></label>
          <label>Display Name<input className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} required /></label>
          <label>New Password<input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Role
            <select className="input-field" value={role} onChange={e => setRole(e.target.value as AdminUser['role'])}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="agent">agent</option>
            </select>
          </label>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
