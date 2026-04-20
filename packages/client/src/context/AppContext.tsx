import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Channel, Message, User, ConnectionState, DmChannel } from '../types';
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
  | { type: 'BUMP_CHANNEL_MEMBERS_VERSION'; channelId: string };

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

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
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
    return channel;
  }, []);

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
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
