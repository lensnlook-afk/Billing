import { useEffect, useState } from 'react';
import { api, type User } from './api/client';
import { Login } from './pages/login';
import { Pos } from './pages/pos';
import { Dashboard } from './pages/dashboard';
import { Inventory } from './pages/inventory';

// Primary tabs shown in bottom nav
const PRIMARY_TABS = [
  { screen: 'Dashboard', icon: '◎', label: 'Home' },
  { screen: 'Billing',   icon: '🧾', label: 'Billing' },
  { screen: 'Inventory', icon: '📦', label: 'Stock' },
  { screen: 'Customers', icon: '👥', label: 'Customers' },
  { screen: 'More',      icon: '≡',  label: 'More' },
];

// All nav items for sidebar + more menu
const ALL_NAV = [
  'Dashboard','Billing','Inventory','Customers','Orders',
  'Purchases','Suppliers','Returns','Payments','Reports',
  'Employees','Audit Logs','Settings',
];

// Items shown in the More menu (everything not in primary tabs)
const MORE_ITEMS = [
  { screen: 'Orders',     icon: '📋', label: 'Orders' },
  { screen: 'Purchases',  icon: '🛒', label: 'Purchases' },
  { screen: 'Suppliers',  icon: '🏭', label: 'Suppliers' },
  { screen: 'Returns',    icon: '↩',  label: 'Returns' },
  { screen: 'Payments',   icon: '💳', label: 'Payments' },
  { screen: 'Reports',    icon: '📈', label: 'Reports' },
  { screen: 'Employees',  icon: '👤', label: 'Employees' },
  { screen: 'Audit Logs', icon: '🔒', label: 'Audit' },
  { screen: 'Settings',   icon: '⚙', label: 'Settings' },
];

export function App() {
  const [user, setUser]       = useState<User | null>(null);
  const [screen, setScreen]   = useState('Billing');
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    api.me().then(x => setUser(x.user)).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="centered">Opening Lens&amp;Look…</main>;
  if (!user)   return <Login onLogin={setUser} />;

  function navigate(s: string) {
    setScreen(s);
    setShowMore(false);
  }

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

  const pageTitle = screen === 'Billing' ? 'Point of Sale' : screen;

  return (
    <div className="shell">
      {/* ── Desktop sidebar ── */}
      <aside>
        <div className="brand">
          <span className="brand-name">Lens&amp;Look</span>
          <small className="brand-sub">BADAMI · ILKAL</small>
        </div>
        <nav>
          {ALL_NAV.map(item => (
            <button
              key={item}
              className={screen === item ? 'active' : ''}
              onClick={() => navigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <footer>
          <strong>{user.displayName}</strong>
          <span>{user.roles.join(' · ')}</span>
          <button onClick={async () => { await api.logout(); setUser(null); }}>Sign out</button>
        </footer>
      </aside>

      {/* ── Main content ── */}
      <main>
        <header>
          <div>
            <p className="eyebrow">LENS&amp;LOOK · NOW IN BADAMI &amp; ILKAL</p>
            <h2>{pageTitle}</h2>
          </div>
          <div className="online"><b /> Live</div>
        </header>
        <div className="page-content">{content}</div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="bottom-nav">
        {PRIMARY_TABS.map(tab => (
          <button
            key={tab.screen}
            className={`bottom-nav-item${screen === tab.screen ? ' active' : ''}`}
            onClick={() => tab.screen === 'More' ? setShowMore(true) : navigate(tab.screen)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {screen === tab.screen && tab.screen !== 'More' && <span className="tab-dot" />}
          </button>
        ))}
      </nav>

      {/* ── More menu overlay ── */}
      {showMore && (
        <div className="more-menu-overlay" onClick={() => setShowMore(false)}>
          <div className="more-menu" onClick={e => e.stopPropagation()}>
            <div className="more-menu-title">More</div>
            {MORE_ITEMS.map(item => (
              <button key={item.screen} className="more-menu-item" onClick={() => navigate(item.screen)}>
                <span className="tab-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            <button
              className="more-menu-item"
              style={{ color: '#f87171' }}
              onClick={async () => { await api.logout(); setUser(null); }}
            >
              <span className="tab-icon">⎋</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
