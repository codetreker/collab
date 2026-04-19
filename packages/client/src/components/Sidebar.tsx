import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { logout } from '../lib/api';
import type { Channel } from '../types';

interface Props {
  onClose?: () => void;
  onLogout?: () => void;
  onAdminOpen?: () => void;
}

export default function Sidebar({ onClose, onLogout, onAdminOpen }: Props) {
  const { state, actions } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSelect = (channelId: string) => {
    actions.selectChannel(channelId);
    onClose?.();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const channel = await actions.createChannel(newName.trim(), newTopic.trim() || undefined);
      actions.selectChannel(channel.id);
      setNewName('');
      setNewTopic('');
      setShowCreate(false);
      onClose?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  // Sort: channels with recent activity first
  const sortedChannels = [...state.channels].sort((a, b) => {
    const aTime = a.last_message_at ?? a.created_at;
    const bTime = b.last_message_at ?? b.created_at;
    return bTime - aTime;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Collab</h1>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? '切换暗色主题' : '切换亮色主题'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowCreate(!showCreate)}
            title="创建频道"
          >
            +
          </button>
        </div>
      </div>

      {showCreate && (
        <form className="channel-create-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="频道名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            className="input-field"
          />
          <input
            type="text"
            placeholder="频道描述（可选）"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            className="input-field"
          />
          <div className="form-actions">
            <button type="submit" disabled={creating || !newName.trim()} className="btn btn-primary btn-sm">
              {creating ? '创建中...' : '创建'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-sm">
              取消
            </button>
          </div>
        </form>
      )}

      <div className="channel-list">
        {sortedChannels.map(channel => (
          <ChannelItem
            key={channel.id}
            channel={channel}
            active={channel.id === state.currentChannelId}
            onClick={() => handleSelect(channel.id)}
          />
        ))}
        {sortedChannels.length === 0 && (
          <div className="sidebar-empty">暂无频道</div>
        )}
      </div>

      <OnlineUsers />

      {state.currentUser && (
        <div className="sidebar-footer">
          <div className="current-user">
            <div className="user-avatar-small">
              {state.currentUser.display_name[0]?.toUpperCase()}
            </div>
            <span className="user-name-small">{state.currentUser.display_name}</span>
            <button
              className="icon-btn logout-btn"
              title="Logout"
              onClick={async () => {
                try {
                  await logout();
                  onLogout?.();
                } catch {
                  window.location.reload();
                }
              }}
            >
              ⏻
            </button>
            {state.currentUser.role === 'admin' && onAdminOpen && (
              <button
                className="icon-btn"
                title="Admin"
                onClick={onAdminOpen}
              >
                ⚙
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelItem({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const unread = channel.unread_count ?? 0;
  return (
    <button
      className={`channel-item ${active ? 'channel-item-active' : ''}`}
      onClick={onClick}
    >
      <span className="channel-hash">#</span>
      <span className="channel-name">{channel.name}</span>
      {unread > 0 && (
        <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  );
}

function OnlineUsers() {
  const { state } = useAppContext();
  const onlineUsers = state.users.filter(u => state.onlineUserIds.has(u.id));

  if (onlineUsers.length === 0) return null;

  return (
    <div className="online-users">
      <div className="online-header">
        在线 — {onlineUsers.length}
      </div>
      {onlineUsers.map(user => (
        <div key={user.id} className="online-user-item">
          <span className="online-dot" />
          <span className="online-user-name">{user.display_name}</span>
          {user.role === 'agent' && <span className="user-badge">Bot</span>}
        </div>
      ))}
    </div>
  );
}
