import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCan } from '../hooks/usePermissions';
import { fetchChannelMembers, logout } from '../lib/api';
import ChannelList from './ChannelList';
import CreateGroupModal from './CreateGroupModal';
import type { DmChannel } from '../types';
import type { ChannelMember } from '../lib/api';

interface Props {
  onClose?: () => void;
  onChannelSelect?: () => void;
  onLogout?: () => void;
  onAgentsOpen?: () => void;
  onWorkspacesOpen?: () => void;
  onRemoteNodesOpen?: () => void;
}

export default function Sidebar({ onClose, onChannelSelect, onLogout, onAgentsOpen, onWorkspacesOpen, onRemoteNodesOpen }: Props) {
  const { state, actions } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const canCreateChannel = useCan('channel.create');
  const [showCreate, setShowCreate] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [newName, setNewName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);

  useEffect(() => {
    if (!state.currentChannelId) {
      setChannelMembers([]);
      return;
    }
    let cancelled = false;
    fetchChannelMembers(state.currentChannelId).then(members => {
      if (!cancelled) setChannelMembers(members);
    }).catch(() => {
      if (!cancelled) setChannelMembers([]);
    });
    return () => { cancelled = true; };
  }, [state.currentChannelId, state.channelMembersVersion]);

  useEffect(() => {
    actions.loadDmChannels();
  }, [actions]);

  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddMenu]);

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

  // Filter out DMs — sorting is handled by ChannelList component
  const nonDmChannels = state.channels.filter(c => c.type !== 'dm');

  // Sort DMs by last message time
  const sortedDms = [...state.dmChannels].sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
    return bTime - aTime;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Borgee</h1>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? '切换暗色主题' : '切换亮色主题'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {canCreateChannel && (
            <div className="sidebar-add-dropdown" ref={addMenuRef}>
              <button
                className="icon-btn"
                onClick={() => setShowAddMenu(!showAddMenu)}
                title="创建"
              >
                +
              </button>
              {showAddMenu && (
                <div className="sidebar-add-menu">
                  <div
                    className="sidebar-add-menu-item"
                    onClick={() => { setShowCreate(true); setShowAddMenu(false); }}
                  >
                    创建频道
                  </div>
                  <div
                    className="sidebar-add-menu-item"
                    onClick={() => { setShowGroupModal(true); setShowAddMenu(false); }}
                  >
                    创建分组
                  </div>
                </div>
              )}
            </div>
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
            {channelMembers
              .filter(u => u.user_id !== state.currentUser?.id)
              .map(u => (
                <label key={u.user_id} className="member-select-item">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.has(u.user_id)}
                    onChange={() => toggleMember(u.user_id)}
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

      <ChannelList
        channels={nonDmChannels}
        currentChannelId={state.currentChannelId}
        onSelectChannel={handleSelect}
      />

      <MergedDmList
        dms={sortedDms}
        currentChannelId={state.currentChannelId}
        onlineUserIds={state.onlineUserIds}
        users={channelMembers}
        currentUserId={state.currentUser?.id}
        onSelectDm={handleSelect}
        onOpenDm={actions.openDm}
      />

      {showGroupModal && (
        <CreateGroupModal
          onClose={() => setShowGroupModal(false)}
          onCreated={() => actions.loadChannels()}
        />
      )}

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

function DmItem({ dm, active, online, onClick }: { dm: DmChannel; active: boolean; online: boolean; onClick: () => void }) {
  const peerName = dm.peer?.display_name ?? dm.name ?? 'DM';

  return (
    <button
      className={`channel-item ${active ? 'channel-item-active' : ''}`}
      onClick={onClick}
    >
      <span className="user-avatar-small dm-avatar">
        {peerName[0]?.toUpperCase()}
        {online && <span className="online-dot avatar-status" />}
      </span>
      <span className="channel-name">{peerName}</span>
      {dm.unread_count > 0 && (
        <span className="unread-badge">{dm.unread_count > 99 ? '99+' : dm.unread_count}</span>
      )}
    </button>
  );
}

function MergedDmList({ dms, currentChannelId, onlineUserIds, users, currentUserId, onSelectDm, onOpenDm }: {
  dms: DmChannel[];
  currentChannelId: string | null;
  onlineUserIds: Set<string>;
  users: ChannelMember[];
  currentUserId?: string;
  onSelectDm: (id: string) => void;
  onOpenDm: (userId: string) => void;
}) {
  const validDms = dms.filter(dm => dm.peer?.id);
  const dmPeerIds = new Set(validDms.map(dm => dm.peer.id));
  const availableMembers = users.filter(u => u.user_id !== currentUserId && !dmPeerIds.has(u.user_id));

  if (validDms.length === 0 && availableMembers.length === 0) return null;

  return (
    <div className="dm-list">
      <div className="online-header">私信</div>
      {validDms.map(dm => (
        <DmItem
          key={dm.id}
          dm={dm}
          active={dm.id === currentChannelId}
          online={onlineUserIds.has(dm.peer.id)}
          onClick={() => onSelectDm(dm.id)}
        />
      ))}
      {availableMembers.map(user => (
        <button
          key={user.user_id}
          className="channel-item online-only-item"
          onClick={() => onOpenDm(user.user_id)}
          title={`私信 ${user.display_name}`}
        >
          <span className="user-avatar-small dm-avatar">
            {user.display_name[0]?.toUpperCase()}
            {onlineUserIds.has(user.user_id) && <span className="online-dot avatar-status" />}
          </span>
          <span className="channel-name">{user.display_name}</span>
          {user.role === 'agent' && <span className="user-badge">Bot</span>}
        </button>
      ))}
    </div>
  );
}
