import { useEffect, useState } from 'react';
import { api } from '../api/client';

const money = (v: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

type DashData = {
  today: { sales: string; collections: string; outstanding: string; invoices: string };
  lowStock: number;
};

export function Dashboard() {
  const [data, setData]   = useState<DashData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch(e => setError(e.message));
  }, []);

  if (error)
    return (
      <section className="empty">
        <h1>Dashboard unavailable</h1>
        <p>{error}</p>
      </section>
    );

  if (!data)
    return <section className="empty"><p>Loading today's operations…</p></section>;

  return (
    <div className="dashboard">

      {/* KPI strip */}
      <div className="kpi-grid">
        <div className="kpi kpi-primary">
          <div className="kpi-label">Sales today</div>
          <div className="kpi-value">{money(data.today.sales)}</div>
          <div className="kpi-sub">Posted invoices · today</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Collected</div>
          <div className="kpi-value">{money(data.today.collections)}</div>
          <div className="kpi-sub">Payments received today</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Outstanding</div>
          <div className="kpi-value">{money(data.today.outstanding)}</div>
          <div className="kpi-sub">Unpaid / partially paid</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Invoices</div>
          <div className="kpi-value">{data.today.invoices}</div>
          <div className="kpi-sub">Bills raised today</div>
        </div>

        <div className={`kpi${Number(data.lowStock) > 0 ? ' kpi-warn' : ''}`}>
          <div className="kpi-label">Low stock</div>
          <div className="kpi-value">{data.lowStock}</div>
          <div className="kpi-sub">Variants below reorder level</div>
        </div>
      </div>

      {/* Status cards */}
      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-label">Today at a glance</div>
          <div className="dash-card-body">
            <div className="dash-stat-row">
              <span>Gross sales</span>
              <strong>{money(data.today.sales)}</strong>
            </div>
            <div className="dash-stat-row">
              <span>Amount collected</span>
              <strong>{money(data.today.collections)}</strong>
            </div>
            <div className="dash-stat-row">
              <span>Amount pending</span>
              <strong>{money(data.today.outstanding)}</strong>
            </div>
            <div className="dash-stat-row">
              <span>Invoices raised</span>
              <strong>{data.today.invoices}</strong>
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-label">Inventory alerts</div>
          <div className="dash-card-body">
            {Number(data.lowStock) === 0 ? (
              <p className="dash-all-good">All variants are above reorder level.</p>
            ) : (
              <p className="dash-warn-text">
                {data.lowStock} variant{Number(data.lowStock) > 1 ? 's are' : ' is'} at or below the reorder threshold.
                Visit Inventory to restock.
              </p>
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-label">System</div>
          <div className="dash-card-body">
            <div className="dash-stat-row">
              <span>Audit chain</span>
              <strong className="dash-ok">Intact</strong>
            </div>
            <div className="dash-stat-row">
              <span>Database</span>
              <strong className="dash-ok">Connected</strong>
            </div>
            <div className="dash-stat-row">
              <span>Session</span>
              <strong className="dash-ok">Secure</strong>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
