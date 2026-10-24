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

// Mobile bottom tabs with SVG icons
const MOB_TABS = [
  {
    screen: 'Dashboard', label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0891b2' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    screen: 'Billing', label: 'Billing',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0891b2' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
  },
  {
    screen: 'Inventory', label: 'Stock',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0891b2' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    screen: 'Customers', label: 'Customers',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0891b2' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    screen: 'More', label: 'More',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0891b2' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" fill={active ? '#0891b2' : '#94a3b8'}/><circle cx="12" cy="12" r="1" fill={active ? '#0891b2' : '#94a3b8'}/><circle cx="12" cy="19" r="1" fill={active ? '#0891b2' : '#94a3b8'}/>
      </svg>
    ),
  },
];

const MORE_ITEMS = [
  {
    screen: 'Reports', label: 'Reports',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
      </svg>
    ),
  },
  {
    screen: 'Audit Logs', label: 'Audit Logs',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
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
      <header className="topnav">
        <div className="topnav-inner">
          <div className="topnav-logo">
            <span className="topnav-logo-mark">L</span>
            <span className="topnav-logo-text">Lens&amp;Look</span>
          </div>
          <nav className="topnav-links">
            {navItems.map(item => (
              <button key={item.screen} className={`topnav-link${screen === item.screen ? ' active' : ''}`} onClick={() => navigate(item.screen)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="topnav-right">
            <span className="topnav-user">{user.displayName}</span>
            <button className="topnav-signout" onClick={async () => { await api.logout(); setUser(null); }}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="page-content">{content}</div>
      </main>

      {/* Mobile bottom nav with icons */}
      <nav className="bottom-nav">
        {MOB_TABS.map(tab => {
          const active = screen === tab.screen;
          return (
            <button
              key={tab.screen}
              className={`bottom-nav-item${active ? ' active' : ''}`}
              onClick={() => tab.screen === 'More' ? setShowMore(true) : navigate(tab.screen)}
            >
              {tab.icon(active)}
              <span className="tab-label">{tab.label}</span>
              {active && tab.screen !== 'More' && <span className="tab-dot" />}
            </button>
          );
        })}
      </nav>

      {showMore && (
        <div className="more-menu-overlay" onClick={() => setShowMore(false)}>
          <div className="more-menu" onClick={e => e.stopPropagation()}>
            <div className="more-menu-title">More</div>
            {MORE_ITEMS.filter(() => isAdmin).map(item => (
              <button key={item.screen} className="more-menu-item" onClick={() => navigate(item.screen)}>
                <span className="more-menu-icon">{item.icon()}</span>
                {item.label}
              </button>
            ))}
            <button className="more-menu-item" onClick={async () => { await api.logout(); setUser(null); }}>
              <span className="more-menu-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </span>
              <span style={{ color: '#f87171' }}>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
