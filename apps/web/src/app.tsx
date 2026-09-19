import { useEffect, useState } from 'react';
import { api, type User } from './api/client';
import { Login } from './pages/login';
import { Pos } from './pages/pos';
import { Dashboard } from './pages/dashboard';
import { Inventory } from './pages/inventory';

const NAV = [
  'Dashboard','Billing','Orders','Customers','Inventory',
  'Purchases','Suppliers','Returns','Payments','Reports',
  'Employees','Audit Logs','Settings',
];

export function App() {
  const [user, setUser]       = useState<User | null>(null);
  const [screen, setScreen]   = useState('Billing');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(x => setUser(x.user)).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="centered">Opening Lens&amp;Look…</main>;
  if (!user)   return <Login onLogin={setUser} />;

  let content: React.ReactNode;
  if (screen === 'Billing')        content = <Pos />;
  else if (screen === 'Dashboard') content = <Dashboard />;
  else if (screen === 'Inventory') content = <Inventory />;
  else content = (
    <section className="empty">
      <h1>{screen}</h1>
      <p>This module is gated until its workflow, audit events, approvals, and tests are implemented.</p>
      <span className="soon-pill">Coming soon</span>
    </section>
  );

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brand-name">Lens&amp;Look</span>
          <small className="brand-sub">BADAMI · ILKAL</small>
        </div>

        <nav>
          {NAV.map(item => (
            <button
              key={item}
              className={screen === item ? 'active' : ''}
              onClick={() => setScreen(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <footer>
          <strong>{user.displayName}</strong>
          <span>{user.roles.join(' · ')}</span>
          <button onClick={async () => { await api.logout(); setUser(null); }}>
            Sign out
          </button>
        </footer>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">LENS&amp;LOOK · NOW IN BADAMI &amp; ILKAL</p>
            <h2>{screen === 'Billing' ? 'Point of Sale' : screen}</h2>
          </div>
          <div className="online"><b /> Secure cloud connection</div>
        </header>
        <div className="page-content">{content}</div>
      </main>
    </div>
  );
}
