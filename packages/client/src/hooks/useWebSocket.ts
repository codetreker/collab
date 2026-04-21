import { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { getDevUserId, fetchMessages } from '../lib/api';
import type { ConnectionState, Message, Channel, PendingMessage } from '../types';

const PING_INTERVAL = 25_000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const AUTH_FAILURE_CODES = new Set([4001, 4003]);

export function useWebSocket() {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const subscribedChannels = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const lastMessageTimestamp = useRef<Map<string, number>>(new Map());
  const scheduleReconnectRef = useRef<() => void>();
  const ackTimers = useRef<Map<string, () => void>>(new Map());
  const handleMessageRef = useRef<(data: { type: string; [key: string]: unknown }) => void>(() => {});

  const findPendingChannelId = useCallback((clientMessageId: string): string | null => {
    for (const [channelId, pending] of state.pendingMessages) {
      if (pending.some(p => p.clientMessageId === clientMessageId)) return channelId;
    }
    return null;
  }, [state.pendingMessages]);

  const setConnectionState = useCallback((cs: ConnectionState) => {
    dispatch({ type: 'SET_CONNECTION_STATE', state: cs });
  }, [dispatch]);

  const reconcilePendingMessages = useCallback((channelId: string, fetchedMessages: Message[]) => {
    const pending = state.pendingMessages.get(channelId);
    if (!pending || pending.length === 0) return;
    const fetchedContents = new Set(fetchedMessages.map(m => `${m.sender_id}:${m.content}`));
    for (const p of pending) {
      if (fetchedContents.has(`${p.senderId}:${p.content}`)) {
        dispatch({ type: 'REMOVE_PENDING_MESSAGE', clientMessageId: p.clientMessageId, channelId });
        ackTimers.current.get(p.clientMessageId)?.();
        ackTimers.current.delete(p.clientMessageId);
      }
    }
  }, [state.pendingMessages, dispatch]);

  const reconcilePendingRef = useRef(reconcilePendingMessages);
  reconcilePendingRef.current = reconcilePendingMessages;

  const connect = useCallback(() => {
    if (wsRef.current) {
      const rs = wsRef.current.readyState;
      if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = new URLSearchParams();
    const userId = getDevUserId();
    if (userId) params.set('user_id', userId);
    const url = `${protocol}//${host}/ws${params.toString() ? `?${params}` : ''}`;

    setConnectionState(reconnectAttempt.current > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      const wasReconnect = reconnectAttempt.current > 0;
      reconnectAttempt.current = 0;
      setConnectionState('connected');

      // Re-subscribe to all channels
      for (const channelId of subscribedChannels.current) {
        ws.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
      }

      // Fetch missed messages on reconnect
      if (wasReconnect) {
        for (const channelId of subscribedChannels.current) {
          const lastTs = lastMessageTimestamp.current.get(channelId);
          if (lastTs) {
            fetchMessages(channelId, { after: lastTs, limit: 50 })
              .then(({ messages }) => {
                for (const msg of messages) {
                  dispatch({ type: 'ADD_MESSAGE', channelId: msg.channel_id, message: msg });
                }
                reconcilePendingRef.current(channelId, messages);
              })
              .catch((err: unknown) => console.warn('[ws] Failed to fetch missed messages:', err));
          }
        }
      }

      // Start heartbeat
      if (pingTimer.current) clearInterval(pingTimer.current);
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        handleMessageRef.current(data);
      } catch {
        // Invalid JSON
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      cleanup();

      if (AUTH_FAILURE_CODES.has(event.code)) {
        setConnectionState('disconnected');
        console.warn('[ws] Auth failure (code %d), not reconnecting:', event.code, event.reason);
        return;
      }

      console.info('[ws] Closed (code %d), scheduling reconnect', event.code);
      scheduleReconnectRef.current?.();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [setConnectionState, dispatch]);

  const cleanup = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = undefined;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    setConnectionState('reconnecting');
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)]!;
    reconnectAttempt.current++;
    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect, setConnectionState]);

  scheduleReconnectRef.current = scheduleReconnect;

  const handleMessage = useCallback((data: { type: string; [key: string]: unknown }) => {
    switch (data.type) {
      case 'new_message': {
        const message = data.message as Message;
        dispatch({ type: 'ADD_MESSAGE', channelId: message.channel_id, message });
        const prev = lastMessageTimestamp.current.get(message.channel_id) ?? 0;
        if (message.created_at > prev) {
          lastMessageTimestamp.current.set(message.channel_id, message.created_at);
        }
        break;
      }
      case 'presence': {
        const userId = data.user_id as string;
        const status = data.status as string;
        if (status === 'online') {
          dispatch({ type: 'USER_ONLINE', userId });
        } else {
          dispatch({ type: 'USER_OFFLINE', userId });
        }
        break;
      }
      case 'channel_created': {
        const channel = data.channel as Channel;
        dispatch({ type: 'ADD_CHANNEL', channel });
        break;
      }
      case 'channel_added': {
        const channel = data.channel as Channel;
        dispatch({ type: 'ADD_CHANNEL', channel });
        break;
      }
      case 'channel_removed': {
        const removedChannelId = data.channel_id as string;
        dispatch({ type: 'REMOVE_CHANNEL', channelId: removedChannelId });
        subscribedChannels.current.delete(removedChannelId);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel_id: removedChannelId }));
        }
        break;
      }
      case 'channel_deleted': {
        const deletedChannelId = data.channel_id as string;
        const deletedName = data.name as string | undefined;
        dispatch({ type: 'REMOVE_CHANNEL', channelId: deletedChannelId });
        subscribedChannels.current.delete(deletedChannelId);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel_id: deletedChannelId }));
        }
        showToast(deletedName ? `频道 #${deletedName} 已被删除` : '频道已被删除');
        break;
      }
      case 'visibility_changed': {
        const chId = data.channel_id as string;
        const vis = data.visibility as 'public' | 'private';
        dispatch({ type: 'UPDATE_CHANNEL', channelId: chId, updates: { visibility: vis } });
        break;
      }
      case 'channel_updated': {
        const updatedChId = data.channel_id as string;
        const updates: Record<string, unknown> = {};
        if (typeof data.topic === 'string') updates.topic = data.topic;
        if (Object.keys(updates).length > 0) {
          dispatch({ type: 'UPDATE_CHANNEL', channelId: updatedChId, updates });
        }
        break;
      }
      case 'user_joined': {
        const joinedChannelId = data.channel_id as string;
        const joinedUserId = data.user_id as string;
        if (joinedUserId) {
          dispatch({ type: 'USER_ONLINE', userId: joinedUserId });
        }
        if (joinedChannelId) {
          if (typeof data.member_count === 'number') {
            dispatch({ type: 'UPDATE_CHANNEL', channelId: joinedChannelId, updates: { member_count: data.member_count as number } });
          }
          dispatch({ type: 'BUMP_CHANNEL_MEMBERS_VERSION', channelId: joinedChannelId });
        }
        break;
      }
      case 'user_left': {
        const leftChannelId = data.channel_id as string;
        if (leftChannelId) {
          if (typeof data.member_count === 'number') {
            dispatch({ type: 'UPDATE_CHANNEL', channelId: leftChannelId, updates: { member_count: data.member_count as number } });
          }
          dispatch({ type: 'BUMP_CHANNEL_MEMBERS_VERSION', channelId: leftChannelId });
        }
        break;
      }
      case 'pong':
        break;
      case 'typing': {
        const channelId = data.channel_id as string;
        const userId = data.user_id as string;
        const displayName = data.display_name as string;
        dispatch({ type: 'SET_TYPING', channelId, userId, displayName });
        break;
      }
      case 'reaction_update': {
        dispatch({
          type: 'UPDATE_REACTIONS',
          messageId: data.message_id as string,
          channelId: data.channel_id as string,
          reactions: data.reactions as { emoji: string; count: number; user_ids: string[] }[],
        });
        break;
      }
      case 'message_ack': {
        const clientMessageId = data.client_message_id as string | null;
        const serverMessage = data.message as Message;
        if (clientMessageId) {
          dispatch({
            type: 'ACK_PENDING_MESSAGE',
            clientMessageId,
            channelId: serverMessage.channel_id,
            serverMessage,
          });
          ackTimers.current.get(clientMessageId)?.();
          ackTimers.current.delete(clientMessageId);
        }
        break;
      }
      case 'message_nack': {
        const nackClientId = data.client_message_id as string | null;
        if (nackClientId) {
          const channelId = findPendingChannelId(nackClientId);
          if (channelId) {
            dispatch({ type: 'FAIL_PENDING_MESSAGE', clientMessageId: nackClientId, channelId });
          }
          ackTimers.current.get(nackClientId)?.();
          ackTimers.current.delete(nackClientId);
        }
        break;
      }
      case 'message_sent':
        break;
      case 'error':
        console.warn('[ws] Server error:', data.message);
        break;
    }
  }, [dispatch, showToast, findPendingChannelId]);

  handleMessageRef.current = handleMessage;

  const subscribe = useCallback((channelId: string) => {
    subscribedChannels.current.add(channelId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
    }
  }, []);

  const unsubscribe = useCallback((channelId: string) => {
    subscribedChannels.current.delete(channelId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel_id: channelId }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      cleanup();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, cleanup]);

  // Auto-subscribe to DM channels
  useEffect(() => {
    for (const dm of state.dmChannels) {
      if (!subscribedChannels.current.has(dm.id)) {
        subscribe(dm.id);
      }
    }
  }, [state.dmChannels, subscribe]);

  const sendWsMessage = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const registerAckTimer = useCallback((clientMessageId: string, cancel: () => void) => {
    ackTimers.current.set(clientMessageId, cancel);
  }, []);

  return {
    subscribe,
    unsubscribe,
    sendWsMessage,
    registerAckTimer,
    connectionState: state.connectionState,
  };
}
