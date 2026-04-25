import React, { useMemo, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import SortableChannelItem, { ChannelItemStatic } from "./SortableChannelItem";
import { useAppContext } from "../context/AppContext";
import * as api from "../lib/api";
import type { Channel } from "../types";

interface Props {
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelList({ channels, currentChannelId, onSelectChannel }: Props) {
  const { state, dispatch } = useAppContext();
  const currentUser = state.currentUser;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Separate member vs non-member channels
  const { memberChannels, previewChannels } = useMemo(() => {
    const member: Channel[] = [];
    const preview: Channel[] = [];
    for (const ch of channels) {
      if (ch.is_member === false) {
        preview.push(ch);
      } else {
        member.push(ch);
      }
    }
    return { memberChannels: member, previewChannels: preview };
  }, [channels]);

  // Sort by position (lexicographic) if available, else by activity
  const sortedMemberChannels = useMemo(() => {
    return [...memberChannels].sort((a, b) => {
      if (a.position && b.position) {
        return a.position.localeCompare(b.position);
      }
      if (a.position && !b.position) return -1;
      if (!a.position && b.position) return 1;
      const aTime = a.last_message_at ?? a.created_at;
      const bTime = b.last_message_at ?? b.created_at;
      return bTime - aTime;
    });
  }, [memberChannels]);

  const sortedPreviewChannels = useMemo(() => {
    return [...previewChannels].sort((a, b) => {
      if (a.position && b.position) {
        return a.position.localeCompare(b.position);
      }
      const aTime = a.last_message_at ?? a.created_at;
      const bTime = b.last_message_at ?? b.created_at;
      return bTime - aTime;
    });
  }, [previewChannels]);

  const channelIds = useMemo(
    () => sortedMemberChannels.map(ch => ch.id),
    [sortedMemberChannels],
  );

  // Keep a ref to sorted channels for rollback
  const prevChannelsRef = useRef<Channel[]>([]);
  prevChannelsRef.current = sortedMemberChannels;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedMemberChannels.findIndex(ch => ch.id === active.id);
    const newIndex = sortedMemberChannels.findIndex(ch => ch.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Compute the reordered list
    const reordered = arrayMove(sortedMemberChannels, oldIndex, newIndex);

    // after_id is the channel just above the new position, or null if moved to top
    const afterId = newIndex === 0 ? null : reordered[reordered.findIndex(ch => ch.id === active.id) - 1]?.id ?? null;

    // Optimistic update: assign temporary positions based on new order
    const snapshot = [...channels];
    const updatedChannels = channels.map(ch => {
      const reorderedIdx = reordered.findIndex(r => r.id === ch.id);
      if (reorderedIdx !== -1) {
        return { ...ch, position: String(reorderedIdx).padStart(6, "0") };
      }
      return ch;
    });
    dispatch({ type: "SET_CHANNELS", channels: updatedChannels });

    // Call API, rollback on failure
    api.reorderChannel(String(active.id), afterId).catch(() => {
      dispatch({ type: "SET_CHANNELS", channels: snapshot });
    });
  }, [sortedMemberChannels, channels, dispatch]);

  return (
    <div className="channel-list">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
          {sortedMemberChannels.map(channel => (
            <SortableChannelItem
              key={channel.id}
              channel={channel}
              active={channel.id === currentChannelId}
              isOwner={currentUser ? channel.created_by === currentUser.id : false}
              onClick={() => onSelectChannel(channel.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {sortedPreviewChannels.length > 0 && (
        <>
          <div className="channel-group-label">公开频道</div>
          {sortedPreviewChannels.map(channel => (
            <ChannelItemStatic
              key={channel.id}
              channel={channel}
              active={channel.id === currentChannelId}
              onClick={() => onSelectChannel(channel.id)}
            />
          ))}
        </>
      )}

      {channels.length === 0 && (
        <div className="sidebar-empty">暂无频道</div>
      )}
    </div>
  );
}
