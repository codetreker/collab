import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  fetchAgents,
  fetchAgent,
  createAgent,
  deleteAgent,
  rotateAgentApiKey,
  fetchAgentPermissions,
  updateAgentPermissions,
  addAgentToChannel,
  type Agent,
  type PermissionDetail,
} from '../lib/api';

const KNOWN_PERMISSIONS = [
  'message.send',
  'channel.create',
  'channel.delete',
  'channel.manage_members',
  'channel.manage_visibility',
];

interface Props {
  onBack: () => void;
}

export default function AgentManager({ onBack }: Props) {
  const { state } = useAppContext();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAgents();
      setAgents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="agent-page">
      <div className="admin-section-header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={onBack}>← Back</button>
          <h2>My Agents</h2>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create Agent</button>
      </div>

      {loading ? (
        <div className="app-loading"><div className="loading-spinner-large" /></div>
      ) : agents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>
          No agents yet. Create one to get started.
        </p>
      ) : (
        agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            expanded={selectedAgent === agent.id}
            onToggle={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
            onDelete={async () => {
              if (!confirm(`Delete agent "${agent.display_name}"?`)) return;
              try {
                await deleteAgent(agent.id);
                await load();
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed');
              }
            }}
            onRefresh={load}
            channels={state.channels}
          />
        ))
      )}

      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  expanded,
  onToggle,
  onDelete,
  onRefresh,
  channels,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  channels: { id: string; name: string }[];
}) {
  const [permissions, setPermissions] = useState<PermissionDetail[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [joinChannelId, setJoinChannelId] = useState('');

  const loadPerms = useCallback(async () => {
    setLoadingPerms(true);
    try {
      const data = await fetchAgentPermissions(agent.id);
      setPermissions(data.details);
    } finally {
      setLoadingPerms(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (expanded) loadPerms();
  }, [expanded, loadPerms]);

  const handleShowKey = async () => {
    if (visibleKey) {
      setVisibleKey(null);
      return;
    }
    setLoadingKey(true);
    try {
      const data = await fetchAgent(agent.id);
      setVisibleKey(data.api_key ?? null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoadingKey(false);
    }
  };

  const handleRotateKey = async () => {
    try {
      const key = await rotateAgentApiKey(agent.id);
      setNewKey(key);
      setVisibleKey(key);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleTogglePerm = async (perm: string) => {
    const has = permissions.some(p => p.permission === perm && p.scope === '*');
    let newPerms: { permission: string; scope?: string }[];
    if (has) {
      newPerms = permissions.filter(p => !(p.permission === perm && p.scope === '*')).map(p => ({ permission: p.permission, scope: p.scope }));
    } else {
      newPerms = [...permissions.map(p => ({ permission: p.permission, scope: p.scope })), { permission: perm, scope: '*' }];
    }
    try {
      await updateAgentPermissions(agent.id, newPerms);
      await loadPerms();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleJoinChannel = async () => {
    if (!joinChannelId) return;
    try {
      await addAgentToChannel(joinChannelId, agent.id);
      setJoinChannelId('');
      alert('Agent added to channel');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="agent-card">
      <div className="admin-card-row">
        <div className="admin-card-info">
          <strong>{agent.display_name}</strong>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            ID: {agent.id.slice(0, 12)}... | Created: {new Date(agent.created_at).toLocaleDateString()}
          </div>
        </div>
        <div className="admin-card-actions">
          <button className="btn btn-sm" onClick={onToggle}>{expanded ? 'Collapse' : 'Manage'}</button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {/* API Key */}
          <div style={{ marginBottom: 12 }}>
            <strong>API Key</strong>
            {(newKey || visibleKey) ? (
              <div className="api-key-box">
                {newKey || visibleKey}
                <button className="btn-icon" onClick={() => navigator.clipboard.writeText((newKey || visibleKey)!)} title="Copy">📋</button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                API key is hidden.
                <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={handleShowKey} disabled={loadingKey}>
                  {loadingKey ? 'Loading...' : 'Show'}
                </button>
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {visibleKey && !newKey && (
                <button className="btn btn-sm" onClick={() => setVisibleKey(null)}>Hide</button>
              )}
              <button className="btn btn-sm" onClick={handleRotateKey}>Rotate API Key</button>
            </div>
          </div>

          {/* Permissions */}
          <div style={{ marginBottom: 12 }}>
            <strong>Permissions</strong>
            {loadingPerms ? (
              <p>Loading...</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {KNOWN_PERMISSIONS.map(perm => {
                  const has = permissions.some(p => p.permission === perm && p.scope === '*');
                  return (
                    <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <input type="checkbox" checked={has} onChange={() => handleTogglePerm(perm)} />
                      {perm}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Join Channel */}
          <div>
            <strong>Add to Channel</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select className="input-field" value={joinChannelId} onChange={e => setJoinChannelId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Select channel...</option>
                {channels.filter(c => c.name !== 'general').map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleJoinChannel} disabled={!joinChannelId}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set(['message.send']));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const togglePerm = (perm: string) => {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm); else next.add(perm);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const trimmedId = agentId.trim() || undefined;
      const agent = await createAgent(displayName.trim(), [...selectedPerms], trimmedId);
      if (agent.api_key) {
        setCreatedKey(agent.api_key);
        setCreatedId(agent.id);
      } else {
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (createdKey) {
    return (
      <div className="admin-modal" onClick={() => { onCreated(); }}>
        <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
          <h3>Agent Created</h3>
          {createdId && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Agent ID: <code>{createdId}</code></p>}
          <p>Copy this API key. You can also view it later from the agent details.</p>
          <div className="api-key-box">
            {createdKey}
            <button className="btn-icon" onClick={() => navigator.clipboard.writeText(createdKey)} title="Copy">📋</button>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" onClick={onCreated}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <h3>Create Agent</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Display Name
            <input className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} required autoFocus />
          </label>
          <label style={{ marginTop: 8, display: 'block' }}>
            Agent ID <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>(optional — auto-generated if empty)</span>
            <input
              className="input-field"
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              placeholder="e.g. my-bot-01"
              pattern="^[a-zA-Z0-9][\w-]{0,62}[a-zA-Z0-9]$"
              title="2-64 characters: letters, digits, hyphens, underscores"
            />
          </label>
          <div style={{ margin: '12px 0' }}>
            <strong style={{ fontSize: 14 }}>Permissions</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {KNOWN_PERMISSIONS.map(perm => (
                <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={selectedPerms.has(perm)} onChange={() => togglePerm(perm)} />
                  {perm}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
