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
  { screen: 'Dashboard', icon: '▤', label: 'Dashboard' },
  { screen: 'Billing',   icon: '⊞', label: 'Billing' },
  { screen: 'Inventory', icon: '⊟', label: 'Inventory' },
  { screen: 'Customers', icon: '◉', label: 'Customers' },
  { screen: 'Reports',   icon: '↗', label: 'Reports',   adminOnly: true },
  { screen: 'Audit Logs',icon: '⊕', label: 'Audit Logs', adminOnly: true },
];

const PRIMARY_TABS = [
  { screen: 'Dashboard', icon: '▤', label: 'Home' },
  { screen: 'Billing',   icon: '⊞', label: 'Bill' },
  { screen: 'Inventory', icon: '⊟', label: 'Stock' },
  { screen: 'Customers', icon: '◉', label: 'Customers' },
  { screen: 'More',      icon: '···', label: 'More' },
];

const MORE_ITEMS = [
  { screen: 'Reports',    icon: '↗', label: 'Reports' },
  { screen: 'Audit Logs', icon: '⊕', label: 'Audit' },
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
    <section className="empty"><h1>Access denied</h1><p>This section is only available to admin.</p></section>
  );
  else content = (
    <section className="empty">
      <h1>{screen}</h1>
      <p>Coming soon.</p>
      <span className="soon-pill">In progress</span>
    </section>
  );

  const pageTitle = screen === 'Billing' ? 'Point of Sale' : screen;
  const sidebarNav = NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);
  const moreItems  = isAdmin ? MORE_ITEMS : [];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brand-name">Lens&amp;Look</span>
          <small className="brand-sub">Badami · Ilkal</small>
        </div>
        <nav>
          {sidebarNav.map(item => (
            <button key={item.screen} className={screen === item.screen ? 'active' : ''} onClick={() => navigate(item.screen)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <footer>
          <span className="user-name">{user.displayName}</span>
          <span className="user-role">{user.roles[0]}</span>
          <button onClick={async () => { await api.logout(); setUser(null); }}>Sign out</button>
        </footer>
      </aside>

      <main>
        <header>
          <div className="header-left">
            <h2>{pageTitle}</h2>
            <span className="header-sub">{isAdmin ? 'Admin' : 'Employee'} · {user.displayName}</span>
          </div>
          <div className="header-right">
            <div className="online"><b /> Live</div>
          </div>
        </header>
        <div className="page-content">{content}</div>
      </main>

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

      {showMore && (
        <div className="more-menu-overlay" onClick={() => setShowMore(false)}>
          <div className="more-menu" onClick={e => e.stopPropagation()}>
            <div className="more-menu-title">More</div>
            {moreItems.map(item => (
              <button key={item.screen} className="more-menu-item" onClick={() => navigate(item.screen)}>
                <span className="tab-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            <button className="more-menu-item" style={{ color: '#f87171' }} onClick={async () => { await api.logout(); setUser(null); }}>
              <span className="tab-icon">↩</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
