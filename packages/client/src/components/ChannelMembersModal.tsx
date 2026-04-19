import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchChannelMembers, addChannelMember, removeChannelMember } from '../lib/api';
import type { ChannelMember } from '../lib/api';

interface Props {
  channelId: string;
  channelName: string;
  channelCreatedBy: string;
  onClose: () => void;
}

export default function ChannelMembersModal({ channelId, channelName, channelCreatedBy, onClose }: Props) {
  const { state } = useAppContext();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAddList, setShowAddList] = useState(false);

  const isGeneral = channelName === 'general';
  const currentUser = state.currentUser;
  const canManage = currentUser?.role === 'admin' || currentUser?.id === channelCreatedBy;

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>#{channelName} 成员</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modal-body"><p>加载中...</p></div>
        ) : (
          <div className="modal-body">
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
