import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import MessageItem from './MessageItem';
import TypingIndicator from './TypingIndicator';

import type { Message, PendingMessage } from '../types';

function toPseudoMessage(p: PendingMessage): Message {
  return {
    id: p.clientMessageId,
    channel_id: p.channelId,
    sender_id: p.senderId,
    sender_name: p.senderName,
    content: p.content,
    content_type: p.contentType,
    reply_to_id: null,
    created_at: p.createdAt,
    edited_at: null,
    mentions: p.mentions,
    _pending: p.status === 'pending',
    _failed: p.status === 'failed',
    _clientMessageId: p.clientMessageId,
  };
}

interface Props {
  channelId: string;
  previewMessages?: Message[] | null;
}

export default function MessageList({ channelId, previewMessages }: Props) {
  const { state, actions, dispatch, sendWsMessage, registerAckTimer } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const isAtBottom = useRef(true);
  const isInitialLoad = useRef(true);
  const loadingOlder = useRef(false);
  const [showNewMsgBtn, setShowNewMsgBtn] = useState(false);
  const prevMessageCount = useRef(0);

  const messages = previewMessages ?? (state.messages.get(channelId) ?? []);
  const pending = previewMessages ? [] : (state.pendingMessages.get(channelId) ?? []);
  const allMessages = [...messages, ...pending.map(toPseudoMessage)];
  const hasMore = state.hasMore.get(channelId) ?? false;
  const isLoading = state.loadingMessages.has(channelId);

  // Scroll to bottom on initial load or new message (if already at bottom)
  useEffect(() => {
    if (isInitialLoad.current && allMessages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialLoad.current = false;
      return;
    }

    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length]);

  // Reset initial load flag when channel changes
  useEffect(() => {
    isInitialLoad.current = true;
    isAtBottom.current = true;
  }, [channelId]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (loadingOlder.current && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight;
      const diff = newScrollHeight - prevScrollHeight.current;
      containerRef.current.scrollTop += diff;
      loadingOlder.current = false;
    }
  }, [allMessages]);

  // Show floating button when new messages arrive while scrolled up
  useEffect(() => {
    if (isInitialLoad.current) {
      prevMessageCount.current = allMessages.length;
      return;
    }
    if (allMessages.length > prevMessageCount.current && !isAtBottom.current) {
      setShowNewMsgBtn(true);
    }
    prevMessageCount.current = allMessages.length;
  }, [allMessages.length]);

  // Reset new-message button on channel switch
  useEffect(() => {
    setShowNewMsgBtn(false);
  }, [channelId]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMsgBtn(false);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if at bottom (within 50px tolerance)
    const { scrollTop, scrollHeight, clientHeight } = container;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 50;

    if (isAtBottom.current) {
      setShowNewMsgBtn(false);
    }

    // Load older messages when scrolled to top
    if (scrollTop < 100 && hasMore && !isLoading) {
      loadingOlder.current = true;
      prevScrollHeight.current = container.scrollHeight;
      actions.loadOlderMessages(channelId);
    }
  }, [channelId, hasMore, isLoading, actions]);

  const handleRetry = useCallback((msg: Message) => {
    if (!msg._clientMessageId) return;
    dispatch({ type: 'REMOVE_PENDING_MESSAGE', clientMessageId: msg._clientMessageId, channelId });

    const newClientMessageId = crypto.randomUUID();
    dispatch({
      type: 'ADD_PENDING_MESSAGE',
      message: {
        clientMessageId: newClientMessageId,
        channelId,
        content: msg.content,
        contentType: msg.content_type,
        status: 'pending',
        createdAt: Date.now(),
        senderName: msg.sender_name ?? '',
        senderId: msg.sender_id,
        mentions: msg.mentions,
      },
    });

    sendWsMessage({
      type: 'send_message',
      channel_id: channelId,
      content: msg.content,
      content_type: msg.content_type,
      client_message_id: newClientMessageId,
      mentions: msg.mentions ?? [],
    });

    const timer = setTimeout(() => {
      dispatch({ type: 'FAIL_PENDING_MESSAGE', clientMessageId: newClientMessageId, channelId });
    }, 10_000);
    registerAckTimer(newClientMessageId, () => clearTimeout(timer));
  }, [channelId, dispatch, sendWsMessage, registerAckTimer]);

  return (
    <div
      className="message-list"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {hasMore && (
        <div className="load-more">
          {isLoading ? (
            <span className="loading-spinner">加载中...</span>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => actions.loadOlderMessages(channelId)}
            >
              加载更早消息
            </button>
          )}
        </div>
      )}

      {!hasMore && messages.length > 0 && (
        <div className="no-more-messages">已到最早消息</div>
      )}

      {isLoading && allMessages.length === 0 && (
        <div className="message-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-item">
              <div className="skeleton-avatar" />
              <div className="skeleton-body">
                <div className="skeleton-line skeleton-short" />
                <div className="skeleton-line skeleton-long" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && allMessages.length === 0 && (
        <div className="empty-channel">
          <p>👋 还没有消息</p>
          <p className="empty-hint">发送第一条消息开始聊天吧</p>
        </div>
      )}

      {allMessages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          userMap={state.userMap}
          currentUserId={state.currentUser?.id}
          currentUserRole={state.currentUser?.role}
          onRetry={msg._failed ? handleRetry : undefined}
        />
      ))}

      <TypingIndicator channelId={channelId} />
      <div ref={bottomRef} />

      {showNewMsgBtn && (
        <button className="new-message-btn" onClick={scrollToBottom}>
          ↓ 新消息
        </button>
      )}
    </div>
  );
}
