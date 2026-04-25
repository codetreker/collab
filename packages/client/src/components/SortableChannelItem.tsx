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

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`channel-item ${active ? "channel-item-active" : ""} ${!isMember ? "channel-item-preview" : ""} ${isDragging ? "channel-item-dragging" : ""}`}
      onClick={onClick}
      {...attributes}
    >
      {isOver && !isDragging && (
        <span className="drop-indicator" />
      )}
      {isOwner && (
        <span className="drag-handle" {...listeners} onClick={e => e.stopPropagation()}>
          ≡
        </span>
      )}
      <span className="channel-hash">{isPrivate ? "🔒" : "#"}</span>
      <span className="channel-name">{channel.name}</span>
      {!isMember && !isPrivate && (
        <span className="preview-badge">预览</span>
      )}
      {unread > 0 && isMember && (
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

  return (
    <button
      className={`channel-item ${active ? "channel-item-active" : ""} ${!isMember ? "channel-item-preview" : ""}`}
      onClick={onClick}
    >
      <span className="channel-hash">{isPrivate ? "🔒" : "#"}</span>
      <span className="channel-name">{channel.name}</span>
      {!isMember && !isPrivate && (
        <span className="preview-badge">预览</span>
      )}
      {unread > 0 && isMember && (
        <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
      )}
    </button>
  );
}
