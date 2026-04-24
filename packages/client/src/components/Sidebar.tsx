import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCan } from '../hooks/usePermissions';
import { logout } from '../lib/api';
import type { Channel, DmChannel } from '../types';

interface Props {
  onClose?: () => void;
  onChannelSelect?: () => void;
  onLogout?: () => void;
  onAdminOpen?: () => void;
  onAgentsOpen?: () => void;
  onWorkspacesOpen?: () => void;
  onRemoteNodesOpen?: () => void;
}

export default function Sidebar({ onClose, onChannelSelect, onLogout, onAdminOpen, onAgentsOpen, onWorkspacesOpen, onRemoteNodesOpen }: Props) {
  const { state, actions } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const canCreateChannel = useCan('channel.create');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  useEffect(() => {
    actions.loadDmChannels();
  }, [actions]);

  const handleSelect = (channelId: string) => {
    actions.selectChannel(channelId);
    onChannelSelect?.();
    onClose?.();
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const channel = await actions.createChannel(
        newName.trim(),
        newTopic.trim() || undefined,
        visibility === 'private' && selectedMemberIds.size > 0 ? [...selectedMemberIds] : undefined,
        visibility,
      );
      actions.selectChannel(channel.id);
      setNewName('');
      setNewTopic('');
      setSelectedMemberIds(new Set());
      setVisibility('public');
      setShowCreate(false);
      onClose?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  // Sort: channels with recent activity first (exclude DMs)
  const sortedChannels = [...state.channels].filter(c => c.type !== 'dm').sort((a, b) => {
    const aTime = a.last_message_at ?? a.created_at;
    const bTime = b.last_message_at ?? b.created_at;
    return bTime - aTime;
  });

  // Sort DMs by last message time
  const sortedDms = [...state.dmChannels].sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
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
          {canCreateChannel && (
            <button
              className="icon-btn"
              onClick={() => setShowCreate(!showCreate)}
              title="创建频道"
            >
              +
            </button>
          )}
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
          <div className="visibility-toggle">
            <label className="visibility-option">
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
              />
              <span>🌐 公开 — 所有人可见</span>
            </label>
            <label className="visibility-option">
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
              />
              <span>🔒 私有 — 仅邀请成员可见</span>
            </label>
          </div>
          {visibility === 'private' && (
          <div className="member-select-list">
            <div className="member-select-label">选择成员（可选）</div>
            {state.users
              .filter(u => u.id !== state.currentUser?.id)
              .map(u => (
                <label key={u.id} className="member-select-item">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.has(u.id)}
                    onChange={() => toggleMember(u.id)}
                  />
                  <span>{u.display_name}</span>
                  {u.role === 'agent' && <span className="user-badge">Bot</span>}
                </label>
              ))}
          </div>
          )}
          <div className="form-actions">
            <button type="submit" disabled={creating || !newName.trim()} className="btn btn-primary btn-sm">
              {creating ? '创建中...' : '创建'}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setSelectedMemberIds(new Set()); setVisibility('public'); }} className="btn btn-sm">
              取消
            </button>
          </div>
        </form>
      )}

      <div className="channel-list">
        {sortedChannels.filter(c => c.is_member !== false).map(channel => (
          <ChannelItem
            key={channel.id}
            channel={channel}
            active={channel.id === state.currentChannelId}
            onClick={() => handleSelect(channel.id)}
          />
        ))}
        {sortedChannels.some(c => c.is_member === false) && (
          <>
            <div className="channel-group-label">公开频道</div>
            {sortedChannels.filter(c => c.is_member === false).map(channel => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                active={channel.id === state.currentChannelId}
                onClick={() => handleSelect(channel.id)}
              />
            ))}
          </>
        )}
        {sortedChannels.length === 0 && (
          <div className="sidebar-empty">暂无频道</div>
        )}
      </div>

      {sortedDms.length > 0 && (
        <div className="dm-list">
          <div className="online-header">私信</div>
          {sortedDms.map(dm => (
            <DmItem
              key={dm.id}
              dm={dm}
              active={dm.id === state.currentChannelId}
              onClick={() => handleSelect(dm.id)}
            />
          ))}
        </div>
      )}

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
            {state.currentUser.role !== 'agent' && onAgentsOpen && (
              <button
                className="icon-btn"
                title="Agents"
                onClick={onAgentsOpen}
              >
                🤖
              </button>
            )}
            {onWorkspacesOpen && (
              <button
                className="icon-btn"
                title="Workspaces"
                onClick={onWorkspacesOpen}
              >
                📂
              </button>
            )}
            {state.currentUser.role !== 'agent' && onRemoteNodesOpen && (
              <button
                className="icon-btn"
                title="Remote Nodes"
                onClick={onRemoteNodesOpen}
              >
                🖥️
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
  const isPrivate = channel.visibility === 'private';
  const isMember = channel.is_member !== false;

  return (
    <button
      className={`channel-item ${active ? 'channel-item-active' : ''} ${!isMember ? 'channel-item-preview' : ''}`}
      onClick={onClick}
    >
      <span className="channel-hash">{isPrivate ? '🔒' : '#'}</span>
      <span className="channel-name">{channel.name}</span>
      {!isMember && !isPrivate && (
        <span className="preview-badge">预览</span>
      )}
      {unread > 0 && isMember && (
        <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  );
}

function DmItem({ dm, active, onClick }: { dm: DmChannel; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`channel-item ${active ? 'channel-item-active' : ''}`}
      onClick={onClick}
    >
      <span className="user-avatar-small dm-avatar">
        {dm.peer.display_name[0]?.toUpperCase()}
      </span>
      <span className="channel-name">{dm.peer.display_name}</span>
      {dm.unread_count > 0 && (
        <span className="unread-badge">{dm.unread_count > 99 ? '99+' : dm.unread_count}</span>
      )}
    </button>
  );
}

function OnlineUsers() {
  const { state, actions } = useAppContext();
  const onlineUsers = state.users.filter(u => state.onlineUserIds.has(u.id) && u.id !== state.currentUser?.id);

  if (onlineUsers.length === 0) return null;

  return (
    <div className="online-users">
      <div className="online-header">
        在线 — {onlineUsers.length}
      </div>
      {onlineUsers.map(user => (
        <button
          key={user.id}
          className="online-user-item"
          onClick={() => actions.openDm(user.id)}
          title={`私信 ${user.display_name}`}
        >
          <span className="online-dot" />
          <span className="online-user-name">{user.display_name}</span>
          {user.role === 'agent' && <span className="user-badge">Bot</span>}
        </button>
      ))}
    </div>
  );
}
