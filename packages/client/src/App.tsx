import React, { useEffect, useState, useCallback } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import ChannelView from './components/ChannelView';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import UserPicker from './components/UserPicker';
import AdminPage from './components/AdminPage';
import AgentManager from './components/AgentManager';
import WorkspaceManager from './components/WorkspaceManager';
import NodeManager from './components/NodeManager';
import { useWebSocket } from './hooks/useWebSocket';
import { setDevUserId, fetchMe, ApiError } from './lib/api';
import './index.css';
import 'highlight.js/styles/github.css';

function AppInner() {
  const { state, actions, dispatch, setSendWsMessage, setRegisterAckTimer } = useAppContext();
  const { subscribe, sendWsMessage, registerAckTimer } = useWebSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showRemoteNodes, setShowRemoteNodes] = useState(false);

  // Wire sendWsMessage into context
  useEffect(() => {
    setSendWsMessage(sendWsMessage);
    setRegisterAckTimer(registerAckTimer);
  }, [sendWsMessage, setSendWsMessage, registerAckTimer, setRegisterAckTimer]);

  // Responsive check
  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auth check
  useEffect(() => {
    fetchMe()
      .then(() => {
        setAuthenticated(true);
        setAuthChecked(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthenticated(false);
        } else {
          setAuthenticated(false);
        }
        setAuthChecked(true);
      });
  }, []);

  // Initialize app data after auth
  useEffect(() => {
    if (!authenticated) return;
    const init = async () => {
      await actions.loadUsers();
      await actions.loadCurrentUser();
      await actions.loadPermissions();
      await actions.loadChannels();
      await actions.loadOnlineUsers();
      dispatch({ type: 'SET_INITIALIZED' });
    };
    init();

    const interval = setInterval(() => {
      actions.loadOnlineUsers();
    }, 30_000);
    return () => clearInterval(interval);
  }, [authenticated, actions, dispatch]);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (state.initialized && !state.currentChannelId && state.channels.length > 0) {
      actions.selectChannel(state.channels[0]!.id);
    }
  }, [state.initialized, state.currentChannelId, state.channels, actions]);

  // Auto-subscribe to all joined channels via WebSocket
  useEffect(() => {
    if (!state.initialized) return;
    for (const ch of state.channels) {
      if (ch.is_member) {
        subscribe(ch.id);
      }
    }
  }, [state.initialized, state.channels, subscribe]);

  // Auto-set dev user if not set (dev mode only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (state.initialized && state.users.length > 0 && !state.currentUser) {
      const admin = state.users.find(u => u.role === 'admin');
      if (admin) {
        setDevUserId(admin.id);
        actions.loadCurrentUser();
      }
    }
  }, [state.initialized, state.users, state.currentUser, actions]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(o => !o);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const closeAllViews = useCallback(() => {
    setShowAdmin(false);
    setShowAgents(false);
    setShowWorkspaces(false);
    setShowRemoteNodes(false);
  }, []);

  const handleLogin = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthenticated(false);
    dispatch({ type: 'SET_CURRENT_USER', user: null });
  }, [dispatch]);

  if (!authChecked) {
    return (
      <div className="app-loading">
        <div className="loading-spinner-large" />
      </div>
    );
  }

  if (!authenticated) {
    if (showRegister) {
      return <RegisterPage onLogin={handleLogin} onBack={() => setShowRegister(false)} />;
    }
    return <LoginPage onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  if (!state.initialized) {
    return (
      <div className="app-loading">
        <div className="loading-spinner-large" />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {isMobile && (
        <button className="hamburger-btn" onClick={toggleSidebar}>
          ☰
        </button>
      )}

      {isMobile && sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}
      <div className={`sidebar-wrapper ${isMobile ? (sidebarOpen ? 'sidebar-open' : 'sidebar-closed') : ''}`}>
        <Sidebar onClose={isMobile ? closeSidebar : undefined} onChannelSelect={closeAllViews} onLogout={handleLogout} onAdminOpen={() => setShowAdmin(true)} onAgentsOpen={() => setShowAgents(true)} onWorkspacesOpen={() => setShowWorkspaces(true)} onRemoteNodesOpen={() => setShowRemoteNodes(true)} />
      </div>

      <div className="main-content">
        {showAdmin ? (
          <AdminPage onBack={() => setShowAdmin(false)} />
        ) : showAgents ? (
          <AgentManager onBack={() => setShowAgents(false)} />
        ) : showWorkspaces ? (
          <WorkspaceManager onBack={() => setShowWorkspaces(false)} />
        ) : showRemoteNodes ? (
          <NodeManager onBack={() => setShowRemoteNodes(false)} />
        ) : state.currentChannelId ? (
          <ChannelView channelId={state.currentChannelId} />
        ) : (
          <div className="no-channel">
            <p>👈 选择一个频道开始聊天</p>
          </div>
        )}
      </div>

      {import.meta.env.DEV && <UserPicker />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
