import { useState } from 'react';
import { api, type User } from '../api/client';

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [busy, setBusy]             = useState(false);

  const backdrop = `linear-gradient(90deg,rgba(10,26,29,.89) 0%,rgba(10,26,29,.67) 49%,rgba(10,26,29,.28) 100%),url(${import.meta.env.BASE_URL}lens-look-storefront.png)`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) { setError('Choose Admin or Employee.'); return; }
    setBusy(true); setError('');
    try {
      onLogin((await api.login(identifier, password)).user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login" style={{ backgroundImage: backdrop }}>
      <section>
        <div className="brand">Lens&amp;Look</div>
        <p className="eyebrow hero-eyebrow">NOW IN BADAMI &amp; ILKAL</p>
        <h1>Every look<br />starts with vision.</h1>
        <p>Sign in to access your shop workspace.</p>
      </section>

      <form onSubmit={submit}>
        <label>
          Login as
          <select id="login-as" name="login-as" value={identifier} onChange={e => setIdentifier(e.target.value)} required>
            <option value="" disabled>Choose account</option>
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </label>

        <label>
          Password
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
