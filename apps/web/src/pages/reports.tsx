import { useEffect, useState } from 'react';

type Period = 'day' | 'week' | 'month';

interface SalesSummary {
  employee_id: string;
  employee: string;
  invoice_count: number;
  total_sales: string;
  total_collected: string;
  total_outstanding: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  grand_total: string;
  amount_paid: string;
  amount_due: string;
  payment_status: string;
  created_at: string;
  cashier: string;
  customer_name: string | null;
  customer_mobile: string | null;
}

interface StockMovement {
  id: string;
  movement_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  created_at: string;
  sku: string;
  product_name: string;
  location_name: string;
  performed_by: string | null;
}

interface Employee { id: string; display_name: string; login_name: string; roles: string[] }

const rupees = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? 'Request failed');
  return body as T;
}

type Tab = 'sales' | 'invoices' | 'stock';

export function Reports() {
  const [tab, setTab] = useState<Tab>('sales');
  const [period, setPeriod] = useState<Period>('day');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sales, setSales] = useState<SalesSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ data: Employee[] }>('/api/v1/reports/employees')
      .then(r => setEmployees(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true); setError('');
    const emp = employeeId ? `&employeeId=${employeeId}` : '';
    const promises: Promise<void>[] = [];
    if (tab === 'sales' || tab === 'invoices') {
      promises.push(
        apiFetch<{ data: SalesSummary[] }>(`/api/v1/reports/sales?period=${period}${emp}`)
          .then(r => setSales(r.data)).catch(e => setError(e.message)),
        apiFetch<{ data: Invoice[] }>(`/api/v1/reports/invoices?period=${period}${emp}`)
          .then(r => setInvoices(r.data)).catch(e => setError(e.message)),
      );
    }
    if (tab === 'stock') {
      promises.push(
        apiFetch<{ data: StockMovement[] }>(`/api/v1/reports/stock-movements?period=${period}`)
          .then(r => setMovements(r.data)).catch(e => setError(e.message)),
      );
    }
    Promise.all(promises).finally(() => setLoading(false));
  }, [tab, period, employeeId]);

  const PERIOD_LABELS: Record<Period, string> = { day: 'Today', week: 'Last 7 days', month: 'Last 30 days' };

  return (
    <div className="reports-page">
      {/* Toolbar */}
      <div className="reports-toolbar">
        <div className="reports-tabs">
          {(['sales','invoices','stock'] as Tab[]).map(t => (
            <button key={t} className={`reports-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'sales' ? '📊 Sales' : t === 'invoices' ? '🧾 Invoices' : '📦 Stock'}
            </button>
          ))}
        </div>
        <div className="reports-filters">
          <div className="period-pills">
            {(['day','week','month'] as Period[]).map(p => (
              <button key={p} className={`period-pill${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {tab !== 'stock' && (
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="reports-emp-select">
              <option value="">All employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.display_name} ({e.login_name})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <div className="inv-empty">Loading report…</div>}

      {/* Sales summary */}
      {!loading && tab === 'sales' && (
        <>
          <div className="reports-summary-grid">
            {sales.length === 0 ? (
              <div className="inv-empty" style={{ gridColumn: '1/-1' }}>No sales for this period.</div>
            ) : sales.map(s => (
              <div key={s.employee_id} className="report-card">
                <div className="report-card-name">{s.employee}</div>
                <div className="report-card-stats">
                  <div className="report-stat">
                    <span>Sales</span>
                    <strong>{rupees(s.total_sales)}</strong>
                  </div>
                  <div className="report-stat">
                    <span>Collected</span>
                    <strong style={{ color: '#16a34a' }}>{rupees(s.total_collected)}</strong>
                  </div>
                  <div className="report-stat">
                    <span>Outstanding</span>
                    <strong style={{ color: Number(s.total_outstanding) > 0 ? '#dc2626' : '#0f172a' }}>
                      {rupees(s.total_outstanding)}
                    </strong>
                  </div>
                  <div className="report-stat">
                    <span>Invoices</span>
                    <strong>{s.invoice_count}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Invoice list below summary */}
          {invoices.length > 0 && (
            <div className="reports-list">
              <div className="reports-list-header">Recent Invoices</div>
              {invoices.map(inv => (
                <div key={inv.id} className="report-invoice-row">
                  <div className="report-invoice-main">
                    <span className="report-inv-number">{inv.invoice_number}</span>
                    <span className="report-inv-cashier">{inv.cashier}</span>
                    {inv.customer_name && <span className="report-inv-customer">👤 {inv.customer_name}</span>}
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
          )}
        </>
      )}

      {/* Invoices tab */}
      {!loading && tab === 'invoices' && (
        <div className="reports-list">
          {invoices.length === 0
            ? <div className="inv-empty">No invoices for this period.</div>
            : invoices.map(inv => (
              <div key={inv.id} className="report-invoice-row">
                <div className="report-invoice-main">
                  <span className="report-inv-number">{inv.invoice_number}</span>
                  <span className="report-inv-cashier">{inv.cashier}</span>
                  {inv.customer_name && <span className="report-inv-customer">👤 {inv.customer_name}</span>}
                  {inv.customer_mobile && <span className="report-inv-customer">{inv.customer_mobile}</span>}
                </div>
                <div className="report-invoice-right">
                  <strong>{rupees(inv.grand_total)}</strong>
                  <span className={`report-status ${inv.payment_status.toLowerCase()}`}>
                    {inv.payment_status.replace('_', ' ')}
                  </span>
                  <span className="report-inv-time">{fmt(inv.created_at)}</span>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Stock movements tab */}
      {!loading && tab === 'stock' && (
        <div className="reports-list">
          {movements.length === 0
            ? <div className="inv-empty">No stock movements for this period.</div>
            : movements.map(m => (
              <div key={m.id} className={`report-movement-row ${m.quantity_delta > 0 ? 'positive' : 'negative'}`}>
                <div className="report-movement-main">
                  <span className="report-inv-number">{m.product_name}</span>
                  <code className="inv-sku">{m.sku}</code>
                  <span className="report-inv-cashier">{m.location_name}</span>
                  {m.reason && <span className="report-inv-customer">{m.reason}</span>}
                </div>
                <div className="report-invoice-right">
                  <strong className={m.quantity_delta > 0 ? 'text-green' : 'text-red'}>
                    {m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}
                  </strong>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{m.quantity_before} → {m.quantity_after}</span>
                  <span className="report-inv-time">{fmt(m.created_at)}</span>
                  {m.performed_by && <span className="report-inv-cashier">{m.performed_by}</span>}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
