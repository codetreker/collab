import React, { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ConnectionStatus from './ConnectionStatus';

interface Props {
  channelId: string;
}

export default function ChannelView({ channelId }: Props) {
  const { state, actions } = useAppContext();
  const { subscribe, unsubscribe, connectionState } = useWebSocket();

  const channel = state.channels.find(c => c.id === channelId);

  // Load messages when channel changes
  useEffect(() => {
    actions.loadMessages(channelId);
  }, [channelId, actions]);

  // Subscribe to channel via WebSocket
  useEffect(() => {
    subscribe(channelId);
    return () => unsubscribe(channelId);
  }, [channelId, subscribe, unsubscribe]);

  if (!channel) {
    return (
      <div className="channel-view">
        <div className="channel-empty">
          频道未找到
        </div>
      </div>
    );
  }

  return (
    <div className="channel-view">
      <div className="channel-header">
        <div className="channel-header-info">
          <h2 className="channel-title">#{channel.name}</h2>
          {channel.topic && <span className="channel-topic">{channel.topic}</span>}
        </div>
      </div>
      <ConnectionStatus state={connectionState} />
      <MessageList channelId={channelId} />
      <MessageInput channelId={channelId} />
    </div>
  );
}
