import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminUserPermissions,
  grantAdminPermission,
  revokeAdminPermission,
  fetchAdminUsers,
} from '../../lib/api';
import type { AdminUser } from '../../types';
import type { PermissionDetail } from '../../lib/api';

const KNOWN_PERMISSIONS = [
  'channel.create',
  'channel.delete',
  'channel.manage_members',
  'channel.manage_visibility',
  'message.send',
];

export default function PermissionsTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [newPerm, setNewPerm] = useState('');
  const [newScope, setNewScope] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const u = await fetchAdminUsers();
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadPerms = useCallback(async (userId: string) => {
    setLoadingPerms(true);
    try {
      const data = await fetchAdminUserPermissions(userId);
      setPermissions(data.details ?? []);
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    loadPerms(userId);
  };

  const handleGrant = async () => {
    if (!selectedUserId || !newPerm) return;
    try {
      await grantAdminPermission(selectedUserId, newPerm, newScope || undefined);
      setNewPerm('');
      setNewScope('');
      await loadPerms(selectedUserId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRevoke = async (perm: PermissionDetail) => {
    if (!selectedUserId) return;
    try {
      await revokeAdminPermission(selectedUserId, perm.permission, perm.scope);
      await loadPerms(selectedUserId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (loading) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div>
      <div className="admin-section-header">
        <h2>Permissions</h2>
      </div>

      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
        <div style={{ width: 240, borderRight: '1px solid var(--border)', paddingRight: 12, overflowY: 'auto' }}>
          {users.filter(u => !(u as any).deleted_at).map(u => (
            <button
              key={u.id}
              className={`admin-nav-item ${u.id === selectedUserId ? 'active' : ''}`}
              onClick={() => handleSelectUser(u.id)}
            >
              {u.display_name}
              <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{u.role}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {!selectedUserId && <p style={{ color: 'var(--text-secondary)' }}>Select a user to manage permissions</p>}

          {selectedUserId && selectedUser && (
            <>
              <h3>{selectedUser.display_name} ({selectedUser.role})</h3>
              {selectedUser.role === 'admin' && <p>Admin has all permissions implicitly.</p>}

              {loadingPerms ? (
                <p>Loading...</p>
              ) : (
                <>
                  {permissions.length > 0 ? (
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead>
                          <tr><th>Permission</th><th>Scope</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                          {permissions.map(p => (
                            <tr key={p.id}>
                              <td><span className="permission-tag">{p.permission}</span></td>
                              <td><code>{p.scope}</code></td>
                              <td><button className="btn btn-sm btn-danger" onClick={() => handleRevoke(p)}>Revoke</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', margin: '12px 0' }}>No explicit permissions.</p>
                  )}

                  {selectedUser.role !== 'admin' && (
                    <div className="admin-card" style={{ marginTop: 16 }}>
                      <strong>Grant Permission</strong>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <select className="input-field" value={newPerm} onChange={e => setNewPerm(e.target.value)} style={{ flex: 1 }}>
                          <option value="">Select permission...</option>
                          {KNOWN_PERMISSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input className="input-field" placeholder="Scope (* or channel:xxx)" value={newScope} onChange={e => setNewScope(e.target.value)} style={{ flex: 1 }} />
                        <button className="btn btn-primary btn-sm" onClick={handleGrant} disabled={!newPerm}>Grant</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
