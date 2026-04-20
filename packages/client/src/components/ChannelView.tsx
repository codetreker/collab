import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { leaveChannel } from '../lib/api';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ConnectionStatus from './ConnectionStatus';
import ChannelMembersModal from './ChannelMembersModal';

interface Props {
  channelId: string;
}

export default function ChannelView({ channelId }: Props) {
  const { state, actions } = useAppContext();
  const { subscribe, unsubscribe, connectionState } = useWebSocket();
  const [showMembers, setShowMembers] = useState(false);

  const channel = state.channels.find(c => c.id === channelId);
  const dmChannel = state.dmChannels.find(dm => dm.id === channelId);
  const isDm = !!dmChannel;

  // Load messages when channel changes
  useEffect(() => {
    actions.loadMessages(channelId);
  }, [channelId, actions]);

  // Subscribe to channel via WebSocket
  useEffect(() => {
    subscribe(channelId);
    return () => unsubscribe(channelId);
  }, [channelId, subscribe, unsubscribe]);

  useEffect(() => {
    setShowMembers(false);
  }, [channelId]);

  if (!channel && !dmChannel) {
    return (
      <div className="channel-view">
        <div className="channel-empty">
          频道未找到
        </div>
      </div>
    );
  }

  const headerTitle = isDm
    ? dmChannel.peer.display_name
    : `${channel!.visibility === 'private' ? '🔒 ' : '#'}${channel!.name}`;
  const headerTopic = isDm ? undefined : channel!.topic;
  const isGeneral = channel?.name === 'general';
  const isMember = !!channel?.is_member;

  const handleLeave = async () => {
    try {
      await leaveChannel(channelId);
      await actions.loadChannels();
    } catch (err) {
      alert(err instanceof Error ? err.message : '离开失败');
    }
  };

  return (
    <div className="channel-view">
      <div className="channel-header">
        <div className="channel-header-info">
          <h2 className="channel-title">{headerTitle}</h2>
          {headerTopic && <span className="channel-topic">{headerTopic}</span>}
        </div>
        {!isDm && channel && (
          <>
            {isMember && !isGeneral && (
              <button
                className="btn btn-sm leave-btn"
                title="离开频道"
                onClick={handleLeave}
              >
                离开频道
              </button>
            )}
            <button
              className="icon-btn"
              title="成员管理"
              onClick={() => setShowMembers(true)}
            >
              👥{channel.member_count != null ? ` ${channel.member_count}` : ''}
            </button>
          </>
        )}
      </div>
      <ConnectionStatus state={connectionState} />
      <MessageList channelId={channelId} />
      {!isDm && channel?.visibility === 'private' && state.currentUser?.role === 'admin' && !isMember ? (
        <MessageInput channelId={channelId} disabled disabledHint="你不是此频道成员，无法发送消息。请先将自己添加为成员。" />
      ) : (
        <MessageInput channelId={channelId} />
      )}
      {showMembers && channel && (
        <ChannelMembersModal
          channelId={channel.id}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}
