import { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { getDevUserId } from '../lib/api';
import type { ConnectionState, Message } from '../types';

const PING_INTERVAL = 25_000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const AUTH_ERROR_CODES = [4001, 4003]; // Don't auto-reconnect on auth failures

export function useWebSocket() {
  const { state, dispatch } = useAppContext();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const subscribedChannels = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const setConnectionState = useCallback((cs: ConnectionState) => {
    dispatch({ type: 'SET_CONNECTION_STATE', state: cs });
  }, [dispatch]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

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
      reconnectAttempt.current = 0;
      setConnectionState('connected');

      // Re-subscribe to all channels
      for (const channelId of subscribedChannels.current) {
        ws.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
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
        handleMessage(data);
      } catch {
        // Invalid JSON
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      cleanup();
      // Don't reconnect on auth errors — retrying won't help
      if (AUTH_ERROR_CODES.includes(event.code)) {
        setConnectionState('disconnected');
        console.warn('[ws] Auth error, not reconnecting:', event.code, event.reason);
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [setConnectionState]);

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

  const handleMessage = useCallback((data: { type: string; [key: string]: unknown }) => {
    switch (data.type) {
      case 'new_message': {
        const message = data.message as Message;
        dispatch({ type: 'ADD_MESSAGE', channelId: message.channel_id, message });
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
        const channel = data.channel as { id: string; name: string; topic: string; created_at: number; created_by: string };
        dispatch({ type: 'ADD_CHANNEL', channel });
        break;
      }
      case 'pong':
        break;
      case 'error':
        console.warn('[ws] Server error:', data.message);
        break;
    }
  }, [dispatch]);

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

  return {
    subscribe,
    unsubscribe,
    connectionState: state.connectionState,
  };
}
