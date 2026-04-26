import React, { useEffect, useState } from 'react';
import { fetchStats } from '../api';
import type { AdminStats } from '../api';

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchStats().then(next => {
      if (!cancelled) setStats(next);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stats');
    });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="admin-error">{error}</div>;
  if (!stats) return <div className="app-loading"><div className="loading-spinner-large" /></div>;

  return (
    <div>
      <div className="admin-section-header"><h2>Dashboard</h2></div>
      <div className="admin-stats-grid">
        <StatCard label="Users" value={stats.user_count} />
        <StatCard label="Channels" value={stats.channel_count} />
        <StatCard label="Online" value={stats.online_count} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card admin-stat-card">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value.toLocaleString()}</div>
    </div>
  );
}
