import React, { useEffect, useState, useCallback } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import Sidebar from './components/Sidebar';
import ChannelView from './components/ChannelView';
import LoginPage from './components/LoginPage';
import UserPicker from './components/UserPicker';
import { setDevUserId, fetchMe, ApiError } from './lib/api';
import './index.css';

function AppInner() {
  const { state, actions, dispatch } = useAppContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

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
    return <LoginPage onLogin={handleLogin} />;
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

      <div className={`sidebar-wrapper ${isMobile ? (sidebarOpen ? 'sidebar-open' : 'sidebar-closed') : ''}`}>
        {isMobile && sidebarOpen && (
          <div className="sidebar-overlay" onClick={closeSidebar} />
        )}
        <Sidebar onClose={isMobile ? closeSidebar : undefined} onLogout={handleLogout} />
      </div>

      <div className="main-content">
        {state.currentChannelId ? (
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
        <AppInner />
      </AppProvider>
    </ThemeProvider>
  );
}
