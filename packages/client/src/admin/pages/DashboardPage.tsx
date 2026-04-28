import React, { useEffect, useState } from 'react';
import { fetchStats } from '../api';
import type { AdminStats, OrgStatsRow } from '../api';

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

  const byOrg = stats.by_org ?? [];

  return (
    <div>
      <div className="admin-section-header"><h2>Dashboard</h2></div>
      <div className="admin-stats-grid">
        <StatCard label="Users" value={stats.user_count} />
        <StatCard label="Channels" value={stats.channel_count} />
        <StatCard label="Online" value={stats.online_count} />
        <StatCard label="Orgs" value={byOrg.length} />
      </div>
      <OrgVisibilityPanel rows={byOrg} />
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

// CM-1.4: visibility checkpoint — render per-org user/channel counts so
// admins can see "1 person = 1 org" landing in production. Blueprint §1.1
// forbids exposing org_id to end-users; this admin-only debug page is the
// approved exception (concept-model §CM-1.4).
function OrgVisibilityPanel({ rows }: { rows: OrgStatsRow[] }) {
  if (!rows.length) {
    return (
      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-section-header"><h3>Organizations (debug)</h3></div>
        <div className="admin-empty">No org rows reported by /stats. (Server may predate CM-1.3.)</div>
      </div>
    );
  }

  return (
    <div className="admin-card" style={{ marginTop: 16 }}>
      <div className="admin-section-header"><h3>Organizations (debug)</h3></div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
        Admin-only visibility (concept-model §CM-1.4). Not exposed to end-users.
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>org_id</th>
            <th style={{ textAlign: 'right' }}>users</th>
            <th style={{ textAlign: 'right' }}>channels</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.org_id || '__empty__'}>
              <td><code>{row.org_id || <span style={{ opacity: 0.5 }}>(empty — v0 orphan)</span>}</code></td>
              <td style={{ textAlign: 'right' }}>{row.user_count.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{row.channel_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
