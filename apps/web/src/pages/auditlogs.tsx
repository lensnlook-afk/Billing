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

const ACTION_COLORS: Record<string, string> = {
  PRODUCT_CREATED:       '#dcfce7|#166534',
  PRODUCT_DELETED:       '#fee2e2|#991b1b',
  PRODUCT_DELETE_DENIED: '#fef3c7|#92400e',
  STOCK_RECEIVED:        '#dbeafe|#1d4ed8',
  CUSTOMER_CREATED:      '#f3e8ff|#6b21a8',
  CUSTOMER_UPDATED:      '#e0f2fe|#0369a1',
  LOGIN_SUCCEEDED:       '#f0fdf4|#15803d',
  LOGIN_FAILED:          '#fef2f2|#dc2626',
  LOGOUT:                '#f8fafc|#475569',
  INVOICE_POSTED:        '#fffbeb|#92400e',
};

function ActionBadge({ action }: { action: string }) {
  const colors = ACTION_COLORS[action] ?? '#f1f5f9|#475569';
  const [bg, fg] = colors.split('|');
  return (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' }}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function AuditLogs() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);

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

  const ACTION_FILTERS = [
    { label: 'All', value: '' },
    { label: 'Products', value: 'PRODUCT' },
    { label: 'Stock', value: 'STOCK' },
    { label: 'Customers', value: 'CUSTOMER' },
    { label: 'Invoices', value: 'INVOICE' },
    { label: 'Logins', value: 'LOGIN' },
  ];

  return (
    <div className="inv-page">
      {/* Toolbar */}
      <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ACTION_FILTERS.map(f => (
            <button
              key={f.value}
              className={`period-pill${action === f.value ? ' active' : ''}`}
              onClick={() => setAction(f.value)}
            >{f.label}</button>
          ))}
        </div>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="reports-emp-select"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <div className="inv-empty">Loading audit logs…</div>}

      {!loading && entries.length === 0 && (
        <div className="inv-empty">No audit entries found.</div>
      )}

      {!loading && entries.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="inv-table-wrap inv-desktop-only">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>By</th>
                  <th>Type</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{fmt(e.occurred_at)}</td>
                    <td><ActionBadge action={e.action} /></td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{e.actor_login ?? '—'}</td>
                    <td style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{e.entity_type?.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: 11, color: '#475569', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.new_value ? JSON.stringify(e.new_value) : e.reason ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="inv-card-list inv-mobile-only">
            {entries.map(e => (
              <div key={e.id} className="inv-card">
                <div className="inv-card-top">
                  <ActionBadge action={e.action} />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmt(e.occurred_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  <strong>{e.actor_login ?? 'system'}</strong>
                  {' · '}{e.entity_type?.replace(/_/g, ' ')}
                </div>
                {e.new_value && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(e.new_value)}
                  </div>
                )}
                {e.reason && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{e.reason}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
