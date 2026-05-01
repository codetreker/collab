import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth';

export default function SettingsPage() {
  const { session, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin', { replace: true });
  };

  return (
    <div>
      <div className="admin-section-header"><h2>Settings</h2></div>
      <div className="admin-card admin-detail-grid">
        <div>
          <div className="admin-detail-label">Login</div>
          <div className="admin-detail-value">{session?.login}</div>
        </div>
        <div>
          <div className="admin-detail-label">ID</div>
          <div className="admin-detail-value admin-detail-mono">{session?.id}</div>
        </div>
        <div>
          <div className="admin-detail-label">API Prefix</div>
          <div className="admin-detail-value admin-detail-mono">/admin-api/v1</div>
        </div>
      </div>
      <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
    </div>
  );
}
