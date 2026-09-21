import { useEffect, useState, useCallback } from 'react';

interface Customer {
  id: string;
  customer_code: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

interface CustomerDetail extends Customer {
  invoices: InvoiceRow[];
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  grand_total: string;
  amount_paid: string;
  amount_due: string;
  payment_status: string;
  created_at: string;
  cashier: string;
}

const rupees = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? 'Request failed');
  return body as T;
}

// ── Customer Form Modal ───────────────────────────────────────────────────────
function CustomerModal({ customer, onClose, onSaved }: {
  customer?: Customer; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    fullName: customer?.full_name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = {
        fullName: form.fullName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      };
      if (customer) {
        await apiFetch(`/api/v1/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/v1/customers', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{customer ? 'Edit Customer' : 'New Customer'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <div className="form-group">
            <label>Full Name *</label>
            <input value={form.fullName} onChange={set('fullName')} placeholder="" required autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Mobile</label>
              <input value={form.phone} onChange={set('phone')} placeholder="" inputMode="tel" maxLength={10} pattern="[0-9]{10}" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={form.email} onChange={set('email')} type="email" placeholder="" />
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={set('address')} placeholder="" />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : customer ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Customer Detail Modal ─────────────────────────────────────────────────────
function CustomerDetailModal({ customer, onClose, onEdit }: {
  customer: CustomerDetail; onClose: () => void; onEdit: () => void;
}) {
  const totalSpent = customer.invoices.reduce((s, i) => s + Number(i.grand_total), 0);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{customer.full_name}</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{customer.customer_code}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="inv-add-stock-btn" onClick={onEdit}>Edit</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <div className="cust-info-grid">
            {customer.phone && <div className="cust-info-item"><span>Mobile</span><strong>{customer.phone}</strong></div>}
            {customer.email && <div className="cust-info-item"><span>Email</span><strong>{customer.email}</strong></div>}
            {customer.address && <div className="cust-info-item"><span>Address</span><strong>{customer.address}</strong></div>}
            <div className="cust-info-item"><span>Customer since</span><strong>{fmt(customer.created_at)}</strong></div>
            <div className="cust-info-item"><span>Total spent</span><strong style={{ color: '#1c64f2' }}>{rupees(totalSpent)}</strong></div>
            <div className="cust-info-item"><span>Invoices</span><strong>{customer.invoices.length}</strong></div>
          </div>

          {customer.invoices.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94a3b8', marginBottom: 8 }}>
                Purchase History
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customer.invoices.map(inv => (
                  <div key={inv.id} className="report-invoice-row">
                    <div className="report-invoice-main">
                      <span className="report-inv-number">{inv.invoice_number}</span>
                      <span className="report-inv-cashier">{inv.cashier}</span>
                    </div>
                    <div className="report-invoice-right">
                      <strong>{rupees(inv.grand_total)}</strong>
                      <span className={`report-status ${inv.payment_status.toLowerCase()}`}>
                        {inv.payment_status.replace('_', ' ')}
                      </span>
                      <span className="report-inv-time">{fmt(inv.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer.invoices.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No purchases yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await apiFetch<{ data: Customer[] }>(`/api/v1/customers?q=${encodeURIComponent(query)}&limit=100`);
      setCustomers(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);

  async function openDetail(id: string) {
    try {
      const r = await apiFetch<{ data: CustomerDetail }>(`/api/v1/customers/${id}`);
      setSelected(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer');
    }
  }

  const withMobile = customers.filter(c => c.phone).length;

  return (
    <div className="inv-page">
      {/* KPIs */}
      <div className="inv-kpis">
        <div className="inv-kpi">
          <div className="inv-kpi-label">Total Customers</div>
          <div className="inv-kpi-value">{customers.length}</div>
        </div>
        <div className="inv-kpi">
          <div className="inv-kpi-label">With Mobile</div>
          <div className="inv-kpi-value">{withMobile}</div>
        </div>
        <div className="inv-kpi inv-kpi-accent">
          <div className="inv-kpi-label">Showing</div>
          <div className="inv-kpi-value">{customers.length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, mobile or code…"          />
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Customer</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="inv-empty">Loading customers…</div>
      ) : customers.length === 0 ? (
        <div className="inv-empty">
          <p>No customers found.</p>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
            Add first customer
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="inv-table-wrap inv-desktop-only">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Since</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c.id)}>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{c.customer_code}</td>
                    <td><div className="inv-product-name">{c.full_name}</div></td>
                    <td>{c.phone ?? '—'}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{c.email ?? '—'}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{fmt(c.created_at)}</td>
                    <td>
                      <button className="inv-add-stock-btn" onClick={e => { e.stopPropagation(); openDetail(c.id); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="inv-card-list inv-mobile-only">
            {customers.map(c => (
              <div key={c.id} className="inv-card" onClick={() => openDetail(c.id)} style={{ cursor: 'pointer' }}>
                <div className="inv-card-top">
                  <div className="inv-card-name">{c.full_name}</div>
                  <button className="inv-add-stock-btn" onClick={e => { e.stopPropagation(); openDetail(c.id); }}>
                    View
                  </button>
                </div>
                <div className="inv-card-meta">
                  <span style={{ fontSize: 11, color: '#64748b' }}>{c.customer_code}</span>
                  {c.phone && <span style={{ fontSize: 12, color: '#475569' }}>📱 {c.phone}</span>}
                  {c.email && <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.email}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Since {fmt(c.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <CustomerModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); void load(); }} />
      )}
      {editing && (
        <CustomerModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            if (selected) void openDetail(selected.id);
            void load();
          }}
        />
      )}
      {selected && !editing && (
        <CustomerDetailModal
          customer={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}
    </div>
  );
}
