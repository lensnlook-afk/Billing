import { useEffect, useState } from 'react';
import { api, type User } from './api/client';
import { Login } from './pages/login';
import { Pos } from './pages/pos';
import { Dashboard } from './pages/dashboard';
import { Inventory } from './pages/inventory';
import { Customers } from './pages/customers';
import { Reports } from './pages/reports';
import { AuditLogs } from './pages/auditlogs';

const NAV_ITEMS = [
  { screen: 'Dashboard',  label: 'Dashboard' },
  { screen: 'Billing',    label: 'Billing' },
  { screen: 'Inventory',  label: 'Inventory' },
  { screen: 'Customers',  label: 'Customers' },
  { screen: 'Reports',    label: 'Reports',    adminOnly: true },
  { screen: 'Audit Logs', label: 'Audit Logs', adminOnly: true },
];

// Mobile bottom tabs
const MOB_TABS = [
  { screen: 'Dashboard', label: 'Home' },
  { screen: 'Billing',   label: 'Billing' },
  { screen: 'Inventory', label: 'Stock' },
  { screen: 'Customers', label: 'Customers' },
  { screen: 'More',      label: 'More' },
];

const MORE_ITEMS = [
  { screen: 'Reports',    label: 'Reports' },
  { screen: 'Audit Logs', label: 'Audit Logs' },
];

export function App() {
  const [user, setUser]         = useState<User | null>(null);
  const [screen, setScreen]     = useState('Billing');
  const [loading, setLoading]   = useState(true);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    api.me().then(x => setUser(x.user)).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="centered">Opening Lens&amp;Look…</main>;
  if (!user)   return <Login onLogin={setUser} />;

  const isAdmin = user.roles.includes('OWNER');
  function navigate(s: string) { setScreen(s); setShowMore(false); }

  let content: React.ReactNode;
  if      (screen === 'Billing')    content = <Pos user={user} />;
  else if (screen === 'Dashboard')  content = <Dashboard />;
  else if (screen === 'Inventory')  content = <Inventory isAdmin={isAdmin} user={user} />;
  else if (screen === 'Customers')  content = <Customers />;
  else if (screen === 'Reports' && isAdmin)    content = <Reports />;
  else if (screen === 'Audit Logs' && isAdmin) content = <AuditLogs />;
  else if (!isAdmin && (screen === 'Reports' || screen === 'Audit Logs')) content = (
    <section className="empty"><h1>Access denied</h1><p>Admin only.</p></section>
  );
  else content = (
    <section className="empty"><h1>{screen}</h1><p>Coming soon.</p><span className="soon-pill">In progress</span></section>
  );

  const navItems = NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);

  return (
    <div className="app-wrap">

      {/* ── Top navbar — matches Lens&Look storefront ── */}
      <header className="topnav">
        <div className="topnav-inner">
          {/* Logo */}
          <div className="topnav-logo">
            <span className="topnav-logo-mark">L</span>
            <span className="topnav-logo-text">Lens&amp;Look</span>
          </div>

          {/* Nav links */}
          <nav className="topnav-links">
            {navItems.map(item => (
              <button
                key={item.screen}
                className={`topnav-link${screen === item.screen ? ' active' : ''}`}
                onClick={() => navigate(item.screen)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right: user + sign out */}
          <div className="topnav-right">
            <span className="topnav-user">{user.displayName}</span>
            <button className="topnav-signout" onClick={async () => { await api.logout(); setUser(null); }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="app-main">
        <div className="page-content">{content}</div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="bottom-nav">
        {MOB_TABS.map(tab => (
          <button
            key={tab.screen}
            className={`bottom-nav-item${screen === tab.screen ? ' active' : ''}`}
            onClick={() => tab.screen === 'More' ? setShowMore(true) : navigate(tab.screen)}
          >
            <span>{tab.label}</span>
            {screen === tab.screen && tab.screen !== 'More' && <span className="tab-dot" />}
          </button>
        ))}
      </nav>

      {/* ── More sheet ── */}
      {showMore && (
        <div className="more-menu-overlay" onClick={() => setShowMore(false)}>
          <div className="more-menu" onClick={e => e.stopPropagation()}>
            <div className="more-menu-title">More</div>
            {MORE_ITEMS.filter(i => isAdmin).map(item => (
              <button key={item.screen} className="more-menu-item" onClick={() => navigate(item.screen)}>
                {item.label}
              </button>
            ))}
            <button className="more-menu-item" style={{ color: '#f87171' }} onClick={async () => { await api.logout(); setUser(null); }}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
