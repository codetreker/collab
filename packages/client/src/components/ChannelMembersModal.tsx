import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchChannelMembers, addChannelMember, removeChannelMember, updateChannel } from '../lib/api';
import type { ChannelMember } from '../lib/api';

interface Props {
  channelId: string;
  channelName: string;
  channelCreatedBy: string;
  channelVisibility?: 'public' | 'private';
  onClose: () => void;
}

export default function ChannelMembersModal({ channelId, channelName, channelCreatedBy, channelVisibility, onClose }: Props) {
  const { state, actions } = useAppContext();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [confirmVisibility, setConfirmVisibility] = useState<'public' | 'private' | null>(null);
  const [switching, setSwitching] = useState(false);

  const isGeneral = channelName === 'general';
  const currentUser = state.currentUser;
  const canManage = currentUser?.role === 'admin' || currentUser?.id === channelCreatedBy;
  const visibility = channelVisibility ?? 'public';

  const load = useCallback(async () => {
    try {
      const m = await fetchChannelMembers(channelId);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  const memberIds = new Set(members.map(m => m.user_id));
  const nonMembers = state.users.filter(u => !memberIds.has(u.id));

  const handleAdd = async (userId: string) => {
    setAdding(true);
    try {
      await addChannelMember(channelId, userId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeChannelMember(channelId, userId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleVisibilitySwitch = async () => {
    if (!confirmVisibility) return;
    setSwitching(true);
    try {
      await updateChannel(channelId, { visibility: confirmVisibility });
      await actions.loadChannels();
      setConfirmVisibility(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSwitching(false);
    }
  };

  const targetVisibility = visibility === 'public' ? 'private' : 'public';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{visibility === 'private' ? '🔒' : '#'}{channelName} 成员</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modal-body"><p>加载中...</p></div>
        ) : (
          <div className="modal-body">
            {canManage && (
              <div className="visibility-section">
                <div className="visibility-current">
                  频道可见性：{visibility === 'public' ? '🌐 公开' : '🔒 私有'}
                </div>
                <button
                  className="btn btn-sm"
                  disabled={isGeneral || switching}
                  onClick={() => setConfirmVisibility(targetVisibility)}
                  title={isGeneral ? '#general 不可设为私有' : undefined}
                >
                  切换为{targetVisibility === 'public' ? '公开' : '私有'}
                </button>
              </div>
            )}

            {confirmVisibility && (
              <div className="confirm-dialog">
                <p>
                  {confirmVisibility === 'private'
                    ? '将频道设为私有？已有成员将保留，新用户不会自动加入。'
                    : '将频道设为公开？所有用户将自动加入此频道。'}
                </p>
                <div className="form-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleVisibilitySwitch}
                    disabled={switching}
                  >
                    {switching ? '切换中...' : '确认'}
                  </button>
                  <button className="btn btn-sm" onClick={() => setConfirmVisibility(null)}>取消</button>
                </div>
              </div>
            )}

            <div className="member-list">
              {members.map(m => (
                <div key={m.user_id} className="member-row">
                  <div className="user-avatar-small">{m.display_name[0]?.toUpperCase()}</div>
                  <span className="member-name">{m.display_name}</span>
                  {m.role === 'agent' && <span className="user-badge">Bot</span>}
                  {m.user_id === channelCreatedBy && <span className="user-badge">创建者</span>}
                  {canManage && !isGeneral && m.user_id !== currentUser?.id && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemove(m.user_id)}
                    >
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canManage && nonMembers.length > 0 && (
              <div className="add-member-section">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setShowAddList(!showAddList)}
                >
                  {showAddList ? '收起' : '添加成员'}
                </button>
                {showAddList && (
                  <div className="member-list add-member-list">
                    {nonMembers.map(u => (
                      <div key={u.id} className="member-row">
                        <div className="user-avatar-small">{u.display_name[0]?.toUpperCase()}</div>
                        <span className="member-name">{u.display_name}</span>
                        {u.role === 'agent' && <span className="user-badge">Bot</span>}
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAdd(u.id)}
                          disabled={adding}
                        >
                          添加
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
