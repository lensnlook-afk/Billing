import { useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  occurred_at: string;
  actor_login: string;
  actor_roles: string[];
  action: string;
  entity_type: string;
  entity_id: string;
  new_value: Record<string, unknown> | null;
  reason: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  ORDER_PLACED:          'Order placed',
  INVOICE_POSTED:        'Order placed',
  PRODUCT_CREATED:       'Product added',
  PRODUCT_DELETED:       'Product deleted',
  PRODUCT_DELETE_DENIED: 'Delete attempt blocked',
  STOCK_RECEIVED:        'Stock added',
  CUSTOMER_CREATED:      'Customer added',
  CUSTOMER_UPDATED:      'Customer updated',
  LOGIN_SUCCEEDED:       'Logged in',
  LOGIN_FAILED:          'Login failed',
  LOGOUT:                'Logged out',
};

const ACTION_COLORS: Record<string, string> = {
  ORDER_PLACED:          '#d1fae5|#065f46',
  INVOICE_POSTED:        '#d1fae5|#065f46',
  PRODUCT_CREATED:       '#dbeafe|#1e40af',
  PRODUCT_DELETED:       '#fee2e2|#991b1b',
  PRODUCT_DELETE_DENIED: '#fef3c7|#92400e',
  STOCK_RECEIVED:        '#e0f2fe|#0369a1',
  CUSTOMER_CREATED:      '#f3e8ff|#6b21a8',
  CUSTOMER_UPDATED:      '#fce7f3|#9d174d',
  LOGIN_SUCCEEDED:       '#f0fdf4|#166534',
  LOGIN_FAILED:          '#fef2f2|#dc2626',
  LOGOUT:                '#f8fafc|#475569',
};

function ActionBadge({ action }: { action: string }) {
  const colors = ACTION_COLORS[action] ?? '#f1f5f9|#475569';
  const [bg, fg] = colors.split('|');
  const label = ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
  return (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label}
    </span>
  );
}

const rupees = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function renderDetail(action: string, value: Record<string, unknown> | null): React.ReactNode {
  if (!value) return null;

  // Order placed — rich display
  if (action === 'ORDER_PLACED' || action === 'INVOICE_POSTED') {
    const items = (value.items as any[]) ?? [];
    const customer = value.customer as string;
    const invoiceNumber = value.invoiceNumber as string;
    const grandTotal = value.grandTotal as string;
    const amountPaid = value.amountPaid as string;
    const amountDue = value.amountDue as string;
    const paymentStatus = value.paymentStatus as string;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {invoiceNumber && <span style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{invoiceNumber}</span>}
        {customer && <span style={{ fontSize: 11, color: '#64748b' }}>👤 {customer}</span>}
        {items.map((item: any, i: number) => (
          <span key={i} style={{ fontSize: 11, color: '#475569' }}>
            {item.product ?? item.sku ?? 'Item'} × {item.qty ?? item.quantity} — {rupees(item.total ?? 0)}
          </span>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          {grandTotal && <span style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>Total {rupees(grandTotal)}</span>}
          {amountPaid && <span style={{ fontSize: 11, color: '#059669' }}>Paid {rupees(amountPaid)}</span>}
          {Number(amountDue) > 0 && <span style={{ fontSize: 11, color: '#d97706' }}>Due {rupees(amountDue)}</span>}
          {paymentStatus && <span style={{ fontSize: 10, background: paymentStatus === 'PAID' ? '#d1fae5' : '#fef3c7', color: paymentStatus === 'PAID' ? '#065f46' : '#92400e', borderRadius: 100, padding: '1px 7px', fontWeight: 700 }}>{paymentStatus.replace('_', ' ')}</span>}
        </div>
      </div>
    );
  }

  // Stock received
  if (action === 'STOCK_RECEIVED') {
    const v = value as any;
    return (
      <span style={{ fontSize: 11, color: '#475569' }}>
        {v.sku ?? ''} · {v.location ?? ''} · +{v.qty ?? ''} units ({v.before ?? 0} → {v.after ?? 0})
      </span>
    );
  }

  // Product created/deleted
  if (action === 'PRODUCT_CREATED' || action === 'PRODUCT_DELETED') {
    const v = value as any;
    return <span style={{ fontSize: 11, color: '#475569' }}>{v.name ?? v.product_name ?? v.sku ?? ''}</span>;
  }

  // Customer created/updated
  if (action === 'CUSTOMER_CREATED' || action === 'CUSTOMER_UPDATED') {
    const v = value as any;
    return (
      <span style={{ fontSize: 11, color: '#475569' }}>
        {v.full_name ?? v.fullName ?? ''}{v.phone ? ` · ${v.phone}` : ''}
      </span>
    );
  }

  // Default — short readable summary, no raw UUIDs
  const display = Object.entries(value)
    .filter(([k, v]) => !String(v).match(/^[0-9a-f]{8}-[0-9a-f]{4}/i) && k !== 'requestId' && k !== 'ip')
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return display ? <span style={{ fontSize: 11, color: '#64748b' }}>{display}</span> : null;
}

const ACTION_FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Orders',    value: 'ORDER' },
  { label: 'Stock',     value: 'STOCK' },
  { label: 'Products',  value: 'PRODUCT' },
  { label: 'Customers', value: 'CUSTOMER' },
  { label: 'Logins',    value: 'LOGIN' },
];

export function AuditLogs() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [action, setAction]   = useState('');
  const [limit, setLimit]     = useState(100);

  useEffect(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ limit: String(limit) });
    if (action) params.set('action', action);
    fetch(`/api/v1/audit?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(r => { if (r.error) throw new Error(r.error.message); setEntries(r.data); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [action, limit]);

  return (
    <div className="inv-page">
      {/* Toolbar */}
      <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 7 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {ACTION_FILTERS.map(f => (
            <button key={f.value} className={`period-pill${action === f.value ? ' active' : ''}`} onClick={() => setAction(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="reports-emp-select">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <div className="inv-empty">Loading…</div>}
      {!loading && entries.length === 0 && <div className="inv-empty">No entries found.</div>}

      {!loading && entries.length > 0 && (
        <div className="reports-list">
          {entries.map(e => (
            <div key={e.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Left: badge + time */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, minWidth: 0 }}>
                <ActionBadge action={e.action} />
                <span style={{ fontSize: 10, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{fmt(e.occurred_at)}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{e.actor_login ?? 'system'}</span>
              </div>
              {/* Right: detail */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                {renderDetail(e.action, e.new_value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
