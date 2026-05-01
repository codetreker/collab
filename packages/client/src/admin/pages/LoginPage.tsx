import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth';

export default function LoginPage() {
  const { login: doLogin } = useAdminAuth();
  const navigate = useNavigate();
  // ADMIN-SPA-SHAPE-FIX D1: server `loginRequest{Login,Password}` byte-identical
  // — form state 走 `login` 不是 `username` (反客户端历史漂).
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await doLogin(login, password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Borgee Admin</h1>
        <form onSubmit={handleSubmit}>
          <label className="login-label">
            Login
            <input className="login-input" value={login} onChange={e => setLogin(e.target.value)} autoFocus />
          </label>
          <label className="login-label">
            Password
            <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn btn btn-primary" disabled={submitting || !login || !password}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
