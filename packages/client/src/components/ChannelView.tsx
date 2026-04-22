import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { leaveChannel, joinChannel, fetchChannelPreview } from '../lib/api';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ConnectionStatus from './ConnectionStatus';
import ChannelMembersModal from './ChannelMembersModal';
import WorkspacePanel from './WorkspacePanel';
import RemotePanel from './RemotePanel';
import { useVisualViewport } from '../hooks/useVisualViewport';
import type { Message } from '../types';

interface Props {
  channelId: string;
}

export default function ChannelView({ channelId }: Props) {
  const { state, actions, sendWsMessage } = useAppContext();
  const connectionState = state.connectionState;
  const [showMembers, setShowMembers] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Message[] | null>(null);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'workspace' | 'remote'>('chat');
  const keyboardHeight = useVisualViewport();

  const channel = state.channels.find(c => c.id === channelId);
  const dmChannel = state.dmChannels.find(dm => dm.id === channelId);
  const isDm = !!dmChannel;
  const isMember = channel?.is_member !== false;
  const isPublicPreview = !isDm && channel && !isMember && channel.visibility !== 'private';

  useEffect(() => {
    if (isPublicPreview) {
      setPreviewMessages(null);
      fetchChannelPreview(channelId).then(data => {
        setPreviewMessages(data.messages);
      }).catch(() => {
        setPreviewMessages([]);
      });
    } else {
      setPreviewMessages(null);
      actions.loadMessages(channelId);
    }
  }, [channelId, isPublicPreview, actions]);

  useEffect(() => {
    setShowMembers(false);
  }, [channelId]);

  if (!channel && !dmChannel) {
    return (
      <div className="channel-view" style={keyboardHeight > 0 ? { height: `calc(100vh - ${keyboardHeight}px)` } : undefined}>
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

  const handleLeave = async () => {
    try {
      await leaveChannel(channelId);
      await actions.loadChannels();
    } catch (err) {
      alert(err instanceof Error ? err.message : '离开失败');
    }
  };

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      await joinChannel(channelId);
      await actions.loadChannels();
      await actions.loadMessages(channelId);
      setPreviewMessages(null);
      sendWsMessage({ type: 'subscribe', channel_id: channelId });
    } catch (err) {
      alert(err instanceof Error ? err.message : '加入失败');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="channel-view" style={keyboardHeight > 0 ? { height: `calc(100vh - ${keyboardHeight}px)` } : undefined}>
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
      {!isDm && isMember && !isPublicPreview && (
        <div className="channel-view-tabs">
          <button className={`channel-view-tab${activeTab === 'chat' ? ' active' : ''}`} onClick={() => setActiveTab('chat')}>聊天</button>
          <button className={`channel-view-tab${activeTab === 'workspace' ? ' active' : ''}`} onClick={() => setActiveTab('workspace')}>Workspace</button>
          <button className={`channel-view-tab${activeTab === 'remote' ? ' active' : ''}`} onClick={() => setActiveTab('remote')}>Remote</button>
        </div>
      )}
      {activeTab === 'workspace' && !isDm && isMember && !isPublicPreview ? (
        <WorkspacePanel channelId={channelId} />
      ) : activeTab === 'remote' && !isDm && isMember && !isPublicPreview ? (
        <RemotePanel channelId={channelId} />
      ) : (
        <>
          {isPublicPreview && (
            <div className="preview-banner">
              你正在预览 <strong>#{channel!.name}</strong>
            </div>
          )}
          <ConnectionStatus state={connectionState} />
          {isPublicPreview ? (
            <>
              <MessageList channelId={channelId} previewMessages={previewMessages} />
              <div className="preview-join-container">
                <button
                  className="btn btn-primary preview-join-btn"
                  onClick={handleJoin}
                  disabled={joining}
                >
                  {joining ? '加入中...' : '加入频道'}
                </button>
              </div>
            </>
          ) : (
            <>
              <MessageList channelId={channelId} />
              {!isDm && channel?.visibility === 'private' && state.currentUser?.role === 'admin' && !isMember ? (
                <MessageInput channelId={channelId} disabled disabledHint="你不是此频道成员，无法发送消息。请先将自己添加为成员。" />
              ) : (
                <MessageInput channelId={channelId} />
              )}
            </>
          )}
        </>
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
