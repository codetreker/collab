import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel } from "../types";

interface Props {
  channel: Channel;
  active: boolean;
  isOwner: boolean;
  onClick: () => void;
  groupId?: string | null;
}

export default function SortableChannelItem({ channel, active, isOwner, onClick, groupId }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: channel.id, disabled: !isOwner, data: { type: 'channel' as const, groupId: groupId ?? null } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
  };

  const unread = channel.unread_count ?? 0;
  const isPrivate = channel.visibility === "private";
  const isMember = channel.is_member !== false;
  // CHN-1.3 立场 ⑤: archived channels render with a dimmed style + 📦 marker
  // so members see closures inline. Server-side they are filtered out of the
  // public discovery list for non-members; current member rows still see them
  // (history preservation, channel-model.md §2 不变量 #3).
  const isArchived = channel.archived_at != null;

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`channel-item ${active ? "channel-item-active" : ""} ${!isMember ? "channel-item-preview" : ""} ${isArchived ? "channel-item-archived" : ""} ${isDragging ? "channel-item-dragging" : ""}`}
      onClick={onClick}
      data-archived={isArchived ? "true" : undefined}
    >
      {isOver && !isDragging && (
        <span className="drop-indicator" />
      )}
      {isOwner && !isArchived && (
        <span className="drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
          ≡
        </span>
      )}
      <span className="channel-hash">{isArchived ? "📦" : isPrivate ? "🔒" : "#"}</span>
      <span className="channel-name">{channel.name}</span>
      {isArchived && <span className="archived-badge" title="已归档">已归档</span>}
      {!isMember && !isPrivate && !isArchived && (
        <span className="preview-badge">预览</span>
      )}
      {unread > 0 && isMember && !isArchived && (
        <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
      )}
    </button>
  );
}

/** Non-sortable version for preview (non-member) channels */
export function ChannelItemStatic({ channel, active, onClick }: Omit<Props, "isOwner">) {
  const unread = channel.unread_count ?? 0;
  const isPrivate = channel.visibility === "private";
  const isMember = channel.is_member !== false;
  const isArchived = channel.archived_at != null;

  return (
    <button
      className={`channel-item ${active ? "channel-item-active" : ""} ${!isMember ? "channel-item-preview" : ""} ${isArchived ? "channel-item-archived" : ""}`}
      onClick={onClick}
      data-archived={isArchived ? "true" : undefined}
    >
      <span className="channel-hash">{isArchived ? "📦" : isPrivate ? "🔒" : "#"}</span>
      <span className="channel-name">{channel.name}</span>
      {isArchived && <span className="archived-badge" title="已归档">已归档</span>}
      {!isMember && !isPrivate && !isArchived && (
        <span className="preview-badge">预览</span>
      )}
      {unread > 0 && isMember && !isArchived && (
        <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
      )}
    </button>
  );
}
