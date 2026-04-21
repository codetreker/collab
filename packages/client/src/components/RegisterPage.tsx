import React, { useState } from 'react';
import { register, login } from '../lib/api';

interface Props {
  onLogin: () => void;
  onBack: () => void;
}

export default function RegisterPage({ onLogin, onBack }: Props) {
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || !email || !password || !displayName || loading) return;
    setLoading(true);
    setError('');
    try {
      await register(inviteCode.trim(), email, password, displayName);
      await login(email, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Collab</h1>
        <h2 style={{ textAlign: 'center', fontSize: 16, marginBottom: 16, fontWeight: 400, color: 'var(--text-secondary)' }}>Create Account</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Invite Code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            className="input-field login-input"
            autoFocus
          />
          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="input-field login-input"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input-field login-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input-field login-input"
          />
          {error && <div className="login-error">{error}</div>}
          <button
            type="submit"
            disabled={loading || !inviteCode || !email || !password || !displayName}
            className="btn btn-primary login-btn"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <div className="register-link">
          <a onClick={onBack}>Already have an account? Log in</a>
        </div>
      </div>
    </div>
  );
}
