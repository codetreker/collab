import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Channel, Message, User, ConnectionState, DmChannel, PendingMessage } from '../types';
import type { PermissionDetail } from '../lib/api';
import * as api from '../lib/api';

// ─── State ──────────────────────────────────────────────

interface AppState {
  channels: Channel[];
  dmChannels: DmChannel[];
  currentChannelId: string | null;
  messages: Map<string, Message[]>;     // channelId -> messages
  hasMore: Map<string, boolean>;        // channelId -> has_more
  loadingMessages: Set<string>;         // channelIds currently loading
  users: User[];
  userMap: Map<string, string>;         // userId -> displayName
  currentUser: User | null;
  permissions: PermissionDetail[] | null;
  onlineUserIds: Set<string>;
  connectionState: ConnectionState;
  channelMembersVersion: Map<string, number>; // channelId -> version counter
  typingUsers: Map<string, Map<string, { displayName: string; expiresAt: number }>>;
  pendingMessages: Map<string, PendingMessage[]>;
  initialized: boolean;
}

const initialState: AppState = {
  channels: [],
  dmChannels: [],
  currentChannelId: null,
  messages: new Map(),
  hasMore: new Map(),
  loadingMessages: new Set(),
  users: [],
  userMap: new Map(),
  currentUser: null,
  permissions: null,
  onlineUserIds: new Set(),
  connectionState: 'disconnected',
  channelMembersVersion: new Map(),
  typingUsers: new Map(),
  pendingMessages: new Map(),
  initialized: false,
};

// ─── Actions ────────────────────────────────────────────

type Action =
  | { type: 'SET_CHANNELS'; channels: Channel[] }
  | { type: 'ADD_CHANNEL'; channel: Channel }
  | { type: 'SET_CURRENT_CHANNEL'; channelId: string | null }
  | { type: 'SET_MESSAGES'; channelId: string; messages: Message[]; hasMore: boolean }
  | { type: 'PREPEND_MESSAGES'; channelId: string; messages: Message[]; hasMore: boolean }
  | { type: 'ADD_MESSAGE'; channelId: string; message: Message }
  | { type: 'SET_LOADING_MESSAGES'; channelId: string; loading: boolean }
  | { type: 'SET_USERS'; users: User[] }
  | { type: 'SET_CURRENT_USER'; user: User | null }
  | { type: 'SET_PERMISSIONS'; permissions: PermissionDetail[] | null }
  | { type: 'SET_ONLINE_USERS'; userIds: string[] }
  | { type: 'USER_ONLINE'; userId: string }
  | { type: 'USER_OFFLINE'; userId: string }
  | { type: 'SET_CONNECTION_STATE'; state: ConnectionState }
  | { type: 'SET_INITIALIZED' }
  | { type: 'UPDATE_UNREAD'; channelId: string; count: number }
  | { type: 'CLEAR_UNREAD'; channelId: string }
  | { type: 'SET_DM_CHANNELS'; channels: DmChannel[] }
  | { type: 'ADD_DM_CHANNEL'; channel: DmChannel }
  | { type: 'UPDATE_DM_CHANNEL'; channelId: string; updates: Partial<DmChannel> }
  | { type: 'REMOVE_CHANNEL'; channelId: string }
  | { type: 'UPDATE_CHANNEL'; channelId: string; updates: Partial<Channel> }
  | { type: 'BUMP_CHANNEL_MEMBERS_VERSION'; channelId: string }
  | { type: 'SET_TYPING'; channelId: string; userId: string; displayName: string }
  | { type: 'CLEAR_EXPIRED_TYPING' }
  | { type: 'UPDATE_REACTIONS'; messageId: string; channelId: string; reactions: { emoji: string; count: number; user_ids: string[] }[] }
  | { type: 'ADD_PENDING_MESSAGE'; message: PendingMessage }
  | { type: 'ACK_PENDING_MESSAGE'; clientMessageId: string; channelId: string; serverMessage: Message }
  | { type: 'FAIL_PENDING_MESSAGE'; clientMessageId: string; channelId: string }
  | { type: 'REMOVE_PENDING_MESSAGE'; clientMessageId: string; channelId: string }
  | { type: 'INSERT_LOCAL_SYSTEM_MESSAGE'; payload: { channelId: string; text: string } }
  | { type: 'NAVIGATE_AFTER_LEAVE'; payload: { channelId: string } };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CHANNELS':
      return { ...state, channels: action.channels };

    case 'ADD_CHANNEL': {
      // Avoid duplicates
      if (state.channels.some(c => c.id === action.channel.id)) return state;
      return { ...state, channels: [...state.channels, action.channel] };
    }

    case 'SET_CURRENT_CHANNEL':
      return { ...state, currentChannelId: action.channelId };

    case 'SET_MESSAGES': {
      const msgs = new Map(state.messages);
      const hm = new Map(state.hasMore);
      msgs.set(action.channelId, action.messages);
      hm.set(action.channelId, action.hasMore);
      return { ...state, messages: msgs, hasMore: hm };
    }

    case 'PREPEND_MESSAGES': {
      const msgs = new Map(state.messages);
      const hm = new Map(state.hasMore);
      const existing = msgs.get(action.channelId) ?? [];
      // Deduplicate
      const existingIds = new Set(existing.map(m => m.id));
      const newMsgs = action.messages.filter(m => !existingIds.has(m.id));
      msgs.set(action.channelId, [...newMsgs, ...existing]);
      hm.set(action.channelId, action.hasMore);
      return { ...state, messages: msgs, hasMore: hm };
    }

    case 'ADD_MESSAGE': {
      const msgs = new Map(state.messages);
      const existing = msgs.get(action.channelId) ?? [];
      // Deduplicate
      if (existing.some(m => m.id === action.message.id)) return state;
      msgs.set(action.channelId, [...existing, action.message]);

      // Update channel last_message_at and bump unread if not current channel
      const channels = state.channels.map(c => {
        if (c.id !== action.channelId) return c;
        return { ...c, last_message_at: action.message.created_at };
      });

      // Increment unread for non-current channel
      const updatedChannels = channels.map(c => {
        if (c.id === action.channelId && c.id !== state.currentChannelId) {
          return { ...c, unread_count: (c.unread_count ?? 0) + 1 };
        }
        return c;
      });

      // Update DM channels too
      const dmChannels = state.dmChannels.map(dm => {
        if (dm.id !== action.channelId) return dm;
        const updated = {
          ...dm,
          last_message: { content: action.message.content, created_at: action.message.created_at },
        };
        if (dm.id !== state.currentChannelId) {
          updated.unread_count = (dm.unread_count ?? 0) + 1;
        }
        return updated;
      });

      return { ...state, messages: msgs, channels: updatedChannels, dmChannels };
    }

    case 'SET_LOADING_MESSAGES': {
      const loading = new Set(state.loadingMessages);
      if (action.loading) loading.add(action.channelId);
      else loading.delete(action.channelId);
      return { ...state, loadingMessages: loading };
    }

    case 'SET_USERS': {
      const userMap = new Map<string, string>();
      for (const u of action.users) {
        userMap.set(u.id, u.display_name);
      }
      return { ...state, users: action.users, userMap };
    }

    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.user };

    case 'SET_PERMISSIONS':
      return { ...state, permissions: action.permissions };

    case 'SET_ONLINE_USERS':
      return { ...state, onlineUserIds: new Set(action.userIds) };

    case 'USER_ONLINE': {
      const s = new Set(state.onlineUserIds);
      s.add(action.userId);
      return { ...state, onlineUserIds: s };
    }

    case 'USER_OFFLINE': {
      const s = new Set(state.onlineUserIds);
      s.delete(action.userId);
      return { ...state, onlineUserIds: s };
    }

    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.state };

    case 'SET_INITIALIZED':
      return { ...state, initialized: true };

    case 'UPDATE_UNREAD': {
      const channels = state.channels.map(c =>
        c.id === action.channelId ? { ...c, unread_count: action.count } : c,
      );
      return { ...state, channels };
    }

    case 'CLEAR_UNREAD': {
      const channels = state.channels.map(c =>
        c.id === action.channelId ? { ...c, unread_count: 0 } : c,
      );
      const dmChannels = state.dmChannels.map(dm =>
        dm.id === action.channelId ? { ...dm, unread_count: 0 } : dm,
      );
      return { ...state, channels, dmChannels };
    }

    case 'SET_DM_CHANNELS':
      return { ...state, dmChannels: action.channels };

    case 'ADD_DM_CHANNEL': {
      if (state.dmChannels.some(dm => dm.id === action.channel.id)) return state;
      return { ...state, dmChannels: [...state.dmChannels, action.channel] };
    }

    case 'UPDATE_DM_CHANNEL': {
      const dmChannels = state.dmChannels.map(dm =>
        dm.id === action.channelId ? { ...dm, ...action.updates } : dm,
      );
      return { ...state, dmChannels };
    }

    case 'REMOVE_CHANNEL': {
      const channels = state.channels.filter(c => c.id !== action.channelId);
      const currentChannelId = state.currentChannelId === action.channelId
        ? (state.channels.find(c => c.name === 'general')?.id ?? null)
        : state.currentChannelId;
      return { ...state, channels, currentChannelId };
    }

    case 'UPDATE_CHANNEL': {
      const channels = state.channels.map(c =>
        c.id === action.channelId ? { ...c, ...action.updates } : c,
      );
      return { ...state, channels };
    }

    case 'BUMP_CHANNEL_MEMBERS_VERSION': {
      const v = new Map(state.channelMembersVersion);
      v.set(action.channelId, (v.get(action.channelId) ?? 0) + 1);
      return { ...state, channelMembersVersion: v };
    }

    case 'SET_TYPING': {
      const typingUsers = new Map(state.typingUsers);
      const channelMap = new Map(typingUsers.get(action.channelId) ?? new Map());
      channelMap.set(action.userId, { displayName: action.displayName, expiresAt: Date.now() + 3000 });
      typingUsers.set(action.channelId, channelMap);
      return { ...state, typingUsers };
    }

    case 'CLEAR_EXPIRED_TYPING': {
      const now = Date.now();
      let changed = false;
      const typingUsers = new Map(state.typingUsers);
      for (const [channelId, userMap] of typingUsers) {
        const filtered = new Map(userMap);
        for (const [userId, info] of filtered) {
          if (info.expiresAt < now) {
            filtered.delete(userId);
            changed = true;
          }
        }
        if (filtered.size === 0) {
          typingUsers.delete(channelId);
        } else {
          typingUsers.set(channelId, filtered);
        }
      }
      return changed ? { ...state, typingUsers } : state;
    }

    case 'UPDATE_REACTIONS': {
      const msgs = new Map(state.messages);
      const channelMsgs = msgs.get(action.channelId);
      if (!channelMsgs) return state;
      const updated = channelMsgs.map(m =>
        m.id === action.messageId ? { ...m, reactions: action.reactions } : m
      );
      msgs.set(action.channelId, updated);
      return { ...state, messages: msgs };
    }

    case 'ADD_PENDING_MESSAGE': {
      const pm = new Map(state.pendingMessages);
      const list = [...(pm.get(action.message.channelId) ?? []), action.message];
      pm.set(action.message.channelId, list);
      return { ...state, pendingMessages: pm };
    }

    case 'ACK_PENDING_MESSAGE': {
      const pm = new Map(state.pendingMessages);
      const list = (pm.get(action.channelId) ?? []).filter(p => p.clientMessageId !== action.clientMessageId);
      if (list.length === 0) pm.delete(action.channelId);
      else pm.set(action.channelId, list);

      const msgs = new Map(state.messages);
      const existing = msgs.get(action.channelId) ?? [];
      if (!existing.some(m => m.id === action.serverMessage.id)) {
        msgs.set(action.channelId, [...existing, action.serverMessage]);
      }

      const channels = state.channels.map(c => {
        if (c.id !== action.channelId) return c;
        return { ...c, last_message_at: action.serverMessage.created_at };
      });

      const dmChannels = state.dmChannels.map(dm => {
        if (dm.id !== action.channelId) return dm;
        return {
          ...dm,
          last_message: { content: action.serverMessage.content, created_at: action.serverMessage.created_at },
        };
      });

      return { ...state, pendingMessages: pm, messages: msgs, channels, dmChannels };
    }

    case 'FAIL_PENDING_MESSAGE': {
      const pm = new Map(state.pendingMessages);
      const list = (pm.get(action.channelId) ?? []).map(p =>
        p.clientMessageId === action.clientMessageId ? { ...p, status: 'failed' as const } : p
      );
      pm.set(action.channelId, list);
      return { ...state, pendingMessages: pm };
    }

    case 'REMOVE_PENDING_MESSAGE': {
      const pm = new Map(state.pendingMessages);
      const list = (pm.get(action.channelId) ?? []).filter(p => p.clientMessageId !== action.clientMessageId);
      if (list.length === 0) pm.delete(action.channelId);
      else pm.set(action.channelId, list);
      return { ...state, pendingMessages: pm };
    }

    case 'INSERT_LOCAL_SYSTEM_MESSAGE': {
      const msgs = new Map(state.messages);
      const existing = msgs.get(action.payload.channelId) ?? [];
      const systemMsg: Message = {
        id: `local-${Date.now()}-${Math.random()}`,
        channel_id: action.payload.channelId,
        sender_id: 'system',
        content: action.payload.text,
        content_type: 'text',
        reply_to_id: null,
        created_at: Date.now(),
        edited_at: null,
      };
      msgs.set(action.payload.channelId, [...existing, systemMsg]);
      return { ...state, messages: msgs };
    }

    case 'NAVIGATE_AFTER_LEAVE': {
      const channels = state.channels.filter(c => c.id !== action.payload.channelId);
      const fallback = channels.find(c => c.name === 'general')?.id ?? channels[0]?.id ?? null;
      const messages = new Map(state.messages);
      messages.delete(action.payload.channelId);
      const pendingMessages = new Map(state.pendingMessages);
      pendingMessages.delete(action.payload.channelId);
      const typingUsers = new Map(state.typingUsers);
      typingUsers.delete(action.payload.channelId);
      const channelMembersVersion = new Map(state.channelMembersVersion);
      channelMembersVersion.delete(action.payload.channelId);
      return { ...state, channels, currentChannelId: fallback, messages, pendingMessages, typingUsers, channelMembersVersion };
    }

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  sendWsMessage: (payload: Record<string, unknown>) => void;
  setSendWsMessage: (fn: (payload: Record<string, unknown>) => void) => void;
  registerAckTimer: (clientMessageId: string, cancel: () => void) => void;
  setRegisterAckTimer: (fn: (clientMessageId: string, cancel: () => void) => void) => void;
  actions: {
    loadChannels: () => Promise<void>;
    loadMessages: (channelId: string) => Promise<void>;
    loadOlderMessages: (channelId: string) => Promise<void>;
    loadUsers: () => Promise<void>;
    loadCurrentUser: () => Promise<void>;
    loadPermissions: () => Promise<void>;
    loadOnlineUsers: () => Promise<void>;
    selectChannel: (channelId: string) => void;
    sendMessage: (channelId: string, content: string, contentType?: 'text' | 'image', mentions?: string[]) => Promise<Message>;
    createChannel: (name: string, topic?: string, memberIds?: string[], visibility?: 'public' | 'private') => Promise<Channel>;
    loadDmChannels: () => Promise<void>;
    openDm: (userId: string) => Promise<void>;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const sendWsMessageRef = useRef<(payload: Record<string, unknown>) => void>(() => {});
  const registerAckTimerRef = useRef<(clientMessageId: string, cancel: () => void) => void>(() => {});

  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: 'CLEAR_EXPIRED_TYPING' });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadChannels = useCallback(async () => {
    const channels = await api.fetchChannels();
    dispatch({ type: 'SET_CHANNELS', channels });
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    if (stateRef.current.loadingMessages.has(channelId)) return;
    dispatch({ type: 'SET_LOADING_MESSAGES', channelId, loading: true });
    try {
      const { messages, has_more } = await api.fetchMessages(channelId, { limit: 50 });
      dispatch({ type: 'SET_MESSAGES', channelId, messages, hasMore: has_more });
    } finally {
      dispatch({ type: 'SET_LOADING_MESSAGES', channelId, loading: false });
    }
  }, []);

  const loadOlderMessages = useCallback(async (channelId: string) => {
    if (stateRef.current.loadingMessages.has(channelId)) return;
    const existing = stateRef.current.messages.get(channelId);
    if (!existing || existing.length === 0) return;

    const oldest = existing[0]!;
    dispatch({ type: 'SET_LOADING_MESSAGES', channelId, loading: true });
    try {
      const { messages, has_more } = await api.fetchMessages(channelId, {
        before: oldest.created_at,
        limit: 50,
      });
      dispatch({ type: 'PREPEND_MESSAGES', channelId, messages, hasMore: has_more });
    } finally {
      dispatch({ type: 'SET_LOADING_MESSAGES', channelId, loading: false });
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const users = await api.fetchUsers();
    dispatch({ type: 'SET_USERS', users });
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await api.fetchMe();
      dispatch({ type: 'SET_CURRENT_USER', user });
    } catch {
      // Not authenticated - will be handled by UI
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await api.fetchMyPermissions();
      dispatch({ type: 'SET_PERMISSIONS', permissions: data.details });
    } catch {
      // Ignore
    }
  }, []);

  const loadOnlineUsers = useCallback(async () => {
    try {
      const userIds = await api.fetchOnlineUsers();
      dispatch({ type: 'SET_ONLINE_USERS', userIds });
    } catch {
      // Ignore errors
    }
  }, []);

  const selectChannel = useCallback((channelId: string) => {
    dispatch({ type: 'SET_CURRENT_CHANNEL', channelId });
    dispatch({ type: 'CLEAR_UNREAD', channelId });
    // Mark as read on server (fire and forget)
    api.markChannelRead(channelId).catch(() => {});
  }, []);

  const sendMessageAction = useCallback(async (
    channelId: string,
    content: string,
    contentType: 'text' | 'image' = 'text',
    mentions?: string[],
  ): Promise<Message> => {
    return api.sendMessage(channelId, content, contentType, mentions);
  }, []);

  const createChannelAction = useCallback(async (
    name: string, topic?: string, memberIds?: string[], visibility?: 'public' | 'private',
  ): Promise<Channel> => {
    const channel = await api.createChannel(name, topic, memberIds, visibility);
    dispatch({ type: 'ADD_CHANNEL', channel });
    await loadPermissions();
    return channel;
  }, [loadPermissions]);

  const loadDmChannels = useCallback(async () => {
    try {
      const channels = await api.fetchDmChannels();
      dispatch({ type: 'SET_DM_CHANNELS', channels });
    } catch {
      // Ignore errors
    }
  }, []);

  const openDm = useCallback(async (userId: string) => {
    const dm = await api.createOrGetDm(userId);
    dispatch({ type: 'ADD_DM_CHANNEL', channel: dm });
    dispatch({ type: 'SET_CURRENT_CHANNEL', channelId: dm.id });
    dispatch({ type: 'CLEAR_UNREAD', channelId: dm.id });
    api.markChannelRead(dm.id).catch(() => {});
  }, []);

  const sendWsMessage = useCallback((payload: Record<string, unknown>) => {
    sendWsMessageRef.current(payload);
  }, []);

  const setSendWsMessage = useCallback((fn: (payload: Record<string, unknown>) => void) => {
    sendWsMessageRef.current = fn;
  }, []);

  const registerAckTimer = useCallback((clientMessageId: string, cancel: () => void) => {
    registerAckTimerRef.current(clientMessageId, cancel);
  }, []);

  const setRegisterAckTimer = useCallback((fn: (clientMessageId: string, cancel: () => void) => void) => {
    registerAckTimerRef.current = fn;
  }, []);

  const actions = useMemo(() => ({
    loadChannels,
    loadMessages,
    loadOlderMessages,
    loadUsers,
    loadCurrentUser,
    loadPermissions,
    loadOnlineUsers,
    selectChannel,
    sendMessage: sendMessageAction,
    createChannel: createChannelAction,
    loadDmChannels,
    openDm,
  }), [loadChannels, loadMessages, loadOlderMessages, loadUsers, loadCurrentUser, loadPermissions, loadOnlineUsers, selectChannel, sendMessageAction, createChannelAction, loadDmChannels, openDm]);

  return (
    <AppContext.Provider value={{ state, dispatch, sendWsMessage, setSendWsMessage, registerAckTimer, setRegisterAckTimer, actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
