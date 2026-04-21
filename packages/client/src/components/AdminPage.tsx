import React, { useState } from 'react';
import UsersTab from './admin/UsersTab';
import InvitesTab from './admin/InvitesTab';
import ChannelsTab from './admin/ChannelsTab';
import PermissionsTab from './admin/PermissionsTab';

interface Props {
  onBack: () => void;
}

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'invites', label: 'Invites' },
  { key: 'channels', label: 'Channels' },
  { key: 'permissions', label: 'Permissions' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminPage({ onBack }: Props) {
  const [tab, setTab] = useState<TabKey>('users');

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <div className="admin-sidebar-header">
          <button className="btn btn-sm" onClick={onBack}>← Back</button>
          <strong>Admin</strong>
        </div>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`admin-nav-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="admin-main">
        {tab === 'users' && <UsersTab />}
        {tab === 'invites' && <InvitesTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'permissions' && <PermissionsTab />}
      </div>
    </div>
  );
}
