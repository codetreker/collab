import React, { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import GroupHeader from './GroupHeader';
import GroupContextMenu from './GroupContextMenu';
import SortableChannelItem from './SortableChannelItem';
import { useAppContext } from '../context/AppContext';
import { updateChannelGroup, deleteChannelGroup } from '../lib/api';
import type { Channel, ChannelGroup, User } from '../types';

interface Props {
  group: ChannelGroup;
  channels: Channel[];
  collapsed: boolean;
  onToggle: () => void;
  currentChannelId: string | null;
  currentUser: User | null;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelGroupComponent({
  group,
  channels,
  collapsed,
  onToggle,
  currentChannelId,
  currentUser,
  onSelectChannel,
}: Props) {
  const { dispatch } = useAppContext();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOwner = currentUser?.id === group.created_by;

  const { setNodeRef: setDroppableRef } = useDroppable({ id: `droppable:group:${group.id}` });

  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      if (a.position && b.position) return a.position.localeCompare(b.position);
      if (a.position && !b.position) return -1;
      if (!a.position && b.position) return 1;
      const aTime = a.last_message_at ?? a.created_at;
      const bTime = b.last_message_at ?? b.created_at;
      return bTime - aTime;
    });
  }, [channels]);

  const channelIds = useMemo(() => sortedChannels.map(ch => ch.id), [sortedChannels]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isOwner) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRenameSubmit = async (name: string) => {
    try {
      const updated = await updateChannelGroup(group.id, name);
      dispatch({ type: 'UPDATE_GROUP', groupId: group.id, updates: { name: updated.name } });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename group');
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    try {
      await deleteChannelGroup(group.id);
      dispatch({ type: 'REMOVE_GROUP', groupId: group.id, ungroupedChannelIds: channels.map(c => c.id) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete group');
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div className="channel-group" ref={setDroppableRef}>
      <GroupHeader
        group={group}
        collapsed={collapsed}
        onToggle={onToggle}
        onContextMenu={handleContextMenu}
        isOwner={isOwner}
        renaming={renaming}
        onRenameSubmit={handleRenameSubmit}
        onRenameCancel={() => setRenaming(false)}
      />
      <div className={`channel-group-channels${collapsed ? ' collapsed' : ''}`}>
        <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
          {sortedChannels.map(channel => (
            <SortableChannelItem
              key={channel.id}
              channel={channel}
              active={channel.id === currentChannelId}
              isOwner={currentUser ? channel.created_by === currentUser.id : false}
              onClick={() => onSelectChannel(channel.id)}
              groupId={group.id}
            />
          ))}
        </SortableContext>
      </div>

      {contextMenu && (
        <GroupContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onRename={() => setRenaming(true)}
          onDelete={() => { setContextMenu(null); setShowDeleteConfirm(true); }}
        />
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)} onKeyDown={e => e.key === 'Escape' && setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>删除分组</h3>
            </div>
            <div className="modal-body">
              <p className="confirm-delete-text">
                确定要删除分组「{group.name}」吗？分组内的频道不会被删除。
              </p>
              <div className="form-actions confirm-delete-actions">
                <button className="btn btn-sm" onClick={() => setShowDeleteConfirm(false)}>取消</button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>删除</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
