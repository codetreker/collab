import React from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAdminAuth } from './auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import ChannelsPage from './pages/ChannelsPage';
import InvitesPage from './pages/InvitesPage';
import SettingsPage from './pages/SettingsPage';
import AdminAuditLogPage from './pages/AdminAuditLogPage';

const nav = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/channels', label: 'Channels' },
  { to: '/admin/invites', label: 'Invites' },
  { to: '/admin/audit-log', label: 'Audit Log' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminApp() {
  return (
    <BrowserRouter>
      <AdminRoutes />
    </BrowserRouter>
  );
}

function AdminRoutes() {
  const { checked, session } = useAdminAuth();

  if (!checked) {
    return <div className="app-loading"><div className="loading-spinner-large" /></div>;
  }

  return (
    <Routes>
      <Route path="/admin" element={session ? <Navigate to="/admin/dashboard" replace /> : <LoginPage />} />
      <Route path="/admin/*" element={session ? <AdminLayout /> : <Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

function AdminLayout() {
  const { session, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="admin-layout admin-spa-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <Link to="/admin/dashboard" className="admin-brand">Borgee Admin</Link>
        </div>
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="admin-sidebar-footer">
          <div className="admin-user-label">{session?.username}</div>
          <button className="btn btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="invites" element={<InvitesPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
