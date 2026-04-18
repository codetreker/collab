import React, { useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import MessageItem from './MessageItem';

interface Props {
  channelId: string;
}

export default function MessageList({ channelId }: Props) {
  const { state, actions } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const isAtBottom = useRef(true);
  const isInitialLoad = useRef(true);
  const loadingOlder = useRef(false);

  const messages = state.messages.get(channelId) ?? [];
  const hasMore = state.hasMore.get(channelId) ?? false;
  const isLoading = state.loadingMessages.has(channelId);

  // Scroll to bottom on initial load or new message (if already at bottom)
  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialLoad.current = false;
      return;
    }

    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

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
  }, [messages]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if at bottom (within 50px tolerance)
    const { scrollTop, scrollHeight, clientHeight } = container;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 50;

    // Load older messages when scrolled to top
    if (scrollTop < 100 && hasMore && !isLoading) {
      loadingOlder.current = true;
      prevScrollHeight.current = container.scrollHeight;
      actions.loadOlderMessages(channelId);
    }
  }, [channelId, hasMore, isLoading, actions]);

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

      {isLoading && messages.length === 0 && (
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

      {!isLoading && messages.length === 0 && (
        <div className="empty-channel">
          <p>👋 还没有消息</p>
          <p className="empty-hint">发送第一条消息开始聊天吧</p>
        </div>
      )}

      {messages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          userMap={state.userMap}
          currentUserId={state.currentUser?.id}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
