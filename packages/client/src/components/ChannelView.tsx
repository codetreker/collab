import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
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

  const headerTitle = isDm ? dmChannel.peer.display_name : `#${channel!.name}`;
  const headerTopic = isDm ? undefined : channel!.topic;

  return (
    <div className="channel-view">
      <div className="channel-header">
        <div className="channel-header-info">
          <h2 className="channel-title">{headerTitle}</h2>
          {headerTopic && <span className="channel-topic">{headerTopic}</span>}
        </div>
        {!isDm && channel && (
          <button
            className="icon-btn"
            title="成员管理"
            onClick={() => setShowMembers(true)}
          >
            👥
          </button>
        )}
      </div>
      <ConnectionStatus state={connectionState} />
      <MessageList channelId={channelId} />
      <MessageInput channelId={channelId} />
      {showMembers && channel && (
        <ChannelMembersModal
          channelId={channel.id}
          channelName={channel.name}
          channelCreatedBy={channel.created_by}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}
