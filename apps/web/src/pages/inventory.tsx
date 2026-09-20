import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StoreLocation { id: string; code: string; name: string }

interface StoreStock { store_id: string; store_name: string; quantity: number; available: number }

interface InventoryProduct {
  product_id: string;
  name: string;
  sku: string;
  type: string;
  selling_price: string;
  cost_price: string;
  tax_rate: string;
  reorder_level: number;
  total_stock: number;
  available: number;
  reserved: number;
  damaged: number;
  locations: StoreStock[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? 'Request failed');
  return body as T;
}

function rupees(v: string | number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
}

// ─── Type badge ──────────────────────────────────────────────────────────────
const TYPE_COLORS: { [key: string]: string } = {
  FRAME:       '#dbeafe|#1d4ed8',
  LENS:        '#dcfce7|#166534',
  CONTACT_LENS:'#fef9c3|#854d0e',
  ACCESSORY:   '#f3e8ff|#6b21a8',
  SERVICE:     '#ffedd5|#9a3412',
  OTHER:       '#f1f5f9|#475569',
};

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_COLORS[type] ?? TYPE_COLORS['OTHER'];
  const [bg, fg] = colors.split('|');
  return (
    <span style={{
      background: bg, color: fg, fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 100, letterSpacing: '.5px',
      textTransform: 'uppercase' as const,
    }}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Add Product Modal ────────────────────────────────────────────────────────
function AddProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', productType: 'FRAME',
    sellingPrice: '', costPrice: '', taxRate: '0',
    color: '', size: '', reorderLevel: '5',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await req('/api/v1/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, sku: form.sku,
          barcode: form.barcode || undefined,
          productType: form.productType,
          sellingPrice: form.sellingPrice,
          costPrice: form.costPrice || undefined,
          taxRate: form.taxRate,
          color: form.color || undefined,
          size: form.size || undefined,
          reorderLevel: Number(form.reorderLevel),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Product</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>Product Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. Ray-Ban Aviator" required />
            </div>
            <div className="form-group">
              <label>Type *</label>
              <select value={form.productType} onChange={set('productType')}>
                <option value="FRAME">Frame</option>
                <option value="LENS">Lens</option>
                <option value="CONTACT_LENS">Contact Lens</option>
                <option value="ACCESSORY">Accessory</option>
                <option value="SERVICE">Service</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>SKU *</label>
              <input value={form.sku} onChange={set('sku')} placeholder="e.g. FR-RB-001" required />
            </div>
            <div className="form-group">
              <label>Barcode</label>
              <input value={form.barcode} onChange={set('barcode')} placeholder="Optional" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Selling Price (₹) *</label>
              <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={set('sellingPrice')} placeholder="0.00" required />
            </div>
            <div className="form-group">
              <label>Cost Price (₹)</label>
              <input type="number" min="0" step="0.01" value={form.costPrice} onChange={set('costPrice')} placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tax Rate (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={set('taxRate')} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Reorder Level</label>
              <input type="number" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Color</label>
              <input value={form.color} onChange={set('color')} placeholder="e.g. Gold" />
            </div>
            <div className="form-group">
              <label>Size</label>
              <input value={form.size} onChange={set('size')} placeholder="e.g. M" />
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Stock Modal ──────────────────────────────────────────────────────────
function AddStockModal({
  product, stores, onClose, onSaved,
}: {
  product: InventoryProduct;
  stores: StoreLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !quantity || !reason) { setError('All fields are required.'); return; }
    setBusy(true); setError('');
    try {
      await req('/api/v1/inventory/stock', {
        method: 'POST',
        body: JSON.stringify({ productId: product.product_id, storeId, quantity: Number(quantity), reason }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stock');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Add Stock</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{product.name} · {product.sku}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <div className="form-group">
            <label>Store / Location *</label>
            <select value={storeId} onChange={e => setStoreId(e.target.value)} required>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity to Add *</label>
            <input
              type="number" min="1" max="100000" value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="Enter quantity" required autoFocus
            />
          </div>
          <div className="form-group">
            <label>Reason *</label>
            <input
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. New stock received from supplier" required
            />
          </div>
          {(product.locations ?? []).length > 0 && (
            <div className="stock-summary">
              <p className="stock-summary-title">Current stock</p>
              {(product.locations ?? []).map(l => (
                <div key={l.store_id} className="stock-summary-row">
                  <span>{l.store_name}</span>
                  <strong>{l.quantity} units</strong>
                </div>
              ))}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function Inventory() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [query, setQuery] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [stockTarget, setStockTarget] = useState<InventoryProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (filterStore) params.set('location', filterStore);
      const [inv, str] = await Promise.all([
        req<{ data: InventoryProduct[] }>(`/api/v1/inventory?${params.toString()}`),
        req<{ data: StoreLocation[] }>('/api/v1/inventory/stores'),
      ]);
      setProducts(inv.data);
      setStores(str.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [query, filterStore]);

  useEffect(() => { void load(); }, [load]);

  const filtered = filterType ? products.filter(p => p.type === filterType) : products;
  const totalValue = products.reduce((s, p) => s + Number(p.selling_price) * p.total_stock, 0);
  const lowStockCount = products.filter(p => p.total_stock <= p.reorder_level).length;

  return (
    <div className="inv-page">
      {/* KPIs */}
      <div className="inv-kpis">
        <div className="inv-kpi">
          <div className="inv-kpi-label">Total Products</div>
          <div className="inv-kpi-value">{products.length}</div>
        </div>
        <div className="inv-kpi">
          <div className="inv-kpi-label">Total Units</div>
          <div className="inv-kpi-value">{products.reduce((s, p) => s + p.total_stock, 0)}</div>
        </div>
        <div className="inv-kpi inv-kpi-accent">
          <div className="inv-kpi-label">Inventory Value</div>
          <div className="inv-kpi-value">{rupees(totalValue)}</div>
        </div>
        <div className={lowStockCount > 0 ? 'inv-kpi inv-kpi-warn' : 'inv-kpi'}>
          <div className="inv-kpi-label">Low Stock Items</div>
          <div className="inv-kpi-value">{lowStockCount}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or SKU…" />
        </div>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="FRAME">Frames</option>
          <option value="LENS">Lenses</option>
          <option value="CONTACT_LENS">Contact Lenses</option>
          <option value="ACCESSORY">Accessories</option>
          <option value="SERVICE">Services</option>
          <option value="OTHER">Other</option>
        </select>
        <button className="btn-primary" onClick={() => setShowAddProduct(true)}>+ Add Product</button>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div className="inv-empty">Loading inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="inv-empty">
          <p>No products found.</p>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowAddProduct(true)}>
            Add your first product
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="inv-table-wrap inv-desktop-only">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Selling Price</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th style={{ textAlign: 'center' }}>Total Stock</th>
                  <th style={{ textAlign: 'center' }}>Available</th>
                  <th style={{ textAlign: 'center' }}>Reserved</th>
                  <th>Stores</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isLow = p.total_stock <= p.reorder_level;
                  return (
                    <tr key={p.product_id} className={isLow ? 'inv-row-warn' : ''}>
                      <td>
                        <div className="inv-product-name">{p.name}</div>
                        {isLow && <div className="inv-low-badge">Low stock</div>}
                      </td>
                      <td><code className="inv-sku">{p.sku}</code></td>
                      <td><TypeBadge type={p.type} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{rupees(p.selling_price)}</td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>{rupees(p.cost_price)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={p.total_stock === 0 ? 'inv-qty inv-qty-zero' : 'inv-qty'}>{p.total_stock}</span>
                      </td>
                      <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{p.available}</td>
                      <td style={{ textAlign: 'center', color: '#64748b' }}>{p.reserved}</td>
                      <td>
                        <div className="inv-store-pills">
                          {(p.locations ?? []).map(l => (
                            <span key={l.store_id} className="inv-store-pill">
                              {l.store_name.replace('Lens & Look — ', '')}: {l.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button className="inv-add-stock-btn" onClick={() => setStockTarget(p)}>+ Stock</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="inv-card-list inv-mobile-only">
            {filtered.map(p => {
              const isLow = p.total_stock <= p.reorder_level;
              return (
                <div key={p.product_id} className={`inv-card${isLow ? ' inv-card-warn' : ''}`}>
                  <div className="inv-card-top">
                    <div className="inv-card-name">
                      {p.name}
                      {isLow && <span className="inv-low-badge" style={{ marginLeft: 6 }}>Low stock</span>}
                    </div>
                    <button className="inv-add-stock-btn" onClick={() => setStockTarget(p)}>+ Stock</button>
                  </div>
                  <div className="inv-card-meta">
                    <code className="inv-sku">{p.sku}</code>
                    <TypeBadge type={p.type} />
                  </div>
                  <div className="inv-card-stats">
                    <div className="inv-card-stat">
                      <span>Price</span>
                      <strong>{rupees(p.selling_price)}</strong>
                    </div>
                    <div className="inv-card-stat">
                      <span>In stock</span>
                      <strong className={p.total_stock === 0 ? 'inv-qty-zero' : ''}>{p.total_stock}</strong>
                    </div>
                    <div className="inv-card-stat">
                      <span>Available</span>
                      <strong style={{ color: '#16a34a' }}>{p.available}</strong>
                    </div>
                  </div>
                  {(p.locations ?? []).length > 0 && (
                    <div className="inv-store-pills" style={{ marginTop: 8 }}>
                      {(p.locations ?? []).map(l => (
                        <span key={l.store_id} className="inv-store-pill">
                          {l.store_name.replace('Lens & Look — ', '')}: {l.quantity}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {showAddProduct && (
        <AddProductModal onClose={() => setShowAddProduct(false)} onSaved={() => { setShowAddProduct(false); void load(); }} />
      )}
      {stockTarget && (
        <AddStockModal
          product={stockTarget} stores={stores}
          onClose={() => setStockTarget(null)}
          onSaved={() => { setStockTarget(null); void load(); }}
        />
      )}
    </div>
  );
}
