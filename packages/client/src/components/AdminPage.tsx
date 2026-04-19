import React, { useState, useEffect, useCallback } from 'react';
import type { AdminUser } from '../types';
import {
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  generateApiKey,
  deleteApiKey,
} from '../lib/api';

interface Props {
  onBack: () => void;
}

export default function AdminPage({ onBack }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const u = await fetchAdminUsers();
      setUsers(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Delete user "${user.display_name}"? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleGenerateKey = async (userId: string) => {
    try {
      const { api_key } = await generateApiKey(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, api_key } : u)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate API key');
    }
  };

  const handleDeleteKey = async (userId: string) => {
    try {
      await deleteApiKey(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, api_key: null } : u)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
  };

  const maskKey = (key: string) => {
    if (key.length <= 12) return key;
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-header">
          <button className="btn btn-sm" onClick={onBack}>← Back</button>
          <h2>Admin — Users</h2>
        </div>
        <div className="app-loading"><div className="loading-spinner-large" /></div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <h2>Admin — Users</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          Create User
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>API Key</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.display_name}</td>
                <td>{user.email ?? '—'}</td>
                <td><span className={`role-badge role-${user.role}`}>{user.role}</span></td>
                <td>
                  {user.api_key ? (
                    <div className="api-key-display">
                      <code>{maskKey(user.api_key)}</code>
                      <button className="btn-icon" onClick={() => handleCopyKey(user.api_key!)} title="Copy">
                        📋
                      </button>
                      <button className="btn-icon" onClick={() => handleGenerateKey(user.id)} title="Regenerate">
                        🔄
                      </button>
                      <button className="btn-icon" onClick={() => handleDeleteKey(user.id)} title="Revoke">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-sm" onClick={() => handleGenerateKey(user.id)}>
                      Generate
                    </button>
                  )}
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="admin-actions">
                    <button className="btn btn-sm" onClick={() => setEditUser(user)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => {
            setUsers((prev) => [...prev, user]);
            setShowCreate(false);
          }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onUpdated={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setEditUser(null);
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const user = await createAdminUser({ email, password, display_name: displayName, role });
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Create User</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Display Name
            <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            Email
            <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Role
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="agent">agent</option>
            </select>
          </label>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (user: AdminUser) => void;
}) {
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
      const data: { display_name?: string; password?: string; role?: string } = {};
      if (displayName !== user.display_name) data.display_name = displayName;
      if (password) data.password = password;
      if (role !== user.role) data.role = role;
      const updated = await updateAdminUser(user.id, data);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Edit User</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Display Name
            <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            New Password (leave blank to keep)
            <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Role
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="agent">agent</option>
            </select>
          </label>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
