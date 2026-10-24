import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StoreLocation { id: string; code: string; name: string }

interface LocationStock { store_id: string; store_name: string; quantity: number }

interface InventoryProduct {
  product_id: string;
  variant_id: string;
  name: string;
  sku: string;
  variant?: string;
  color?: string;
  size?: string;
  type?: string;
  selling_price: string;
  cost_price: string;
  tax_rate: string;
  reorder_level: number;
  total_stock: number;
  available: number;
  reserved: number;
  damaged: number;
  stock_value: string;
  created_at: string;
  locations: LocationStock[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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
function AddProductModal({ onClose, onSaved, stores }: { onClose: () => void; onSaved: () => void; stores: StoreLocation[] }) {
  const [form, setForm] = useState({
    name: '',
    productType: 'FRAME',
    sellingPrice: '', costPrice: '',
    color: '', size: '', reorderLevel: '5',
    initialQty: '',
    storeId: stores[0]?.id ?? '',
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
      const qty = Number(form.initialQty) || 0;
      await req('/api/v1/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          productType: form.productType,
          sellingPrice: form.sellingPrice,
          costPrice: form.costPrice || undefined,
          color: form.color || undefined,
          size: form.size || undefined,
          reorderLevel: Number(form.reorderLevel) || 5,
          openingQuantity: qty > 0 ? qty : undefined,
          locationId: qty > 0 && form.storeId ? form.storeId : undefined,
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
          <div className="form-group">
            <label>Product Name *</label>
            <input value={form.name} onChange={set('name')} required autoFocus />
          </div>
          <div className="form-group">
            <label>Category *</label>
            <select value={form.productType} onChange={set('productType')}>
              <option value="FRAME">Frame</option>
              <option value="LENS">Lens</option>
              <option value="CONTACT_LENS">Contact Lens</option>
              <option value="ACCESSORY">Accessory</option>
              <option value="SERVICE">Service</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Selling Price (₹) *</label>
              <input type="number" min="0" step="1" value={form.sellingPrice} onChange={set('sellingPrice')} required inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Cost Price (₹)</label>
              <input type="number" min="0" step="1" value={form.costPrice} onChange={set('costPrice')} inputMode="decimal" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Color</label>
              <input value={form.color} onChange={set('color')} />
            </div>
            <div className="form-group">
              <label>Size</label>
              <input value={form.size} onChange={set('size')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Initial Quantity</label>
              <input type="number" min="0" value={form.initialQty} onChange={set('initialQty')} placeholder="0" inputMode="numeric" />
            </div>
            <div className="form-group">
              <label>Store</label>
              <select value={form.storeId} onChange={set('storeId')}>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name.replace('Lens & Look — ','')}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Low Stock Alert Qty</label>
            <input type="number" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} placeholder="5" inputMode="numeric" />
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !quantity) { setError('All fields are required.'); return; }
    setBusy(true); setError('');
    try {
      await req('/api/v1/inventory/stock', {
        method: 'POST',
        body: JSON.stringify({ variantId: product.variant_id, locationId: storeId, quantity: Number(quantity) }),
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
            <div className="qty-quick">
              <button type="button" onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 0) + 1)))}>+1</button>
              <button type="button" onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 0) + 5)))}>+5</button>
              <button type="button" onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 0) + 10)))}>+10</button>
              <button type="button" onClick={() => setQuantity('')}>Clear</button>
            </div>
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
          )}          {error && <p className="error">{error}</p>}
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
export function Inventory({ isAdmin = false, user }: { isAdmin?: boolean; user?: { displayName: string } }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [query, setQuery] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [stockTarget, setStockTarget] = useState<InventoryProduct | null>(null);

  async function deleteProduct(p: InventoryProduct) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await req(`/api/v1/inventory/products/${p.product_id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  const load = useCallback(async () => {    setLoading(true); setError('');
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

  const filtered = products
    .filter(p => !filterType || p.type === filterType)
    .filter(p => {
      if (!filterStock) return true;
      if (filterStock === 'low') return p.total_stock > 0 && p.total_stock <= p.reorder_level;
      if (filterStock === 'out') return p.total_stock === 0;
      if (filterStock === 'in') return p.total_stock > p.reorder_level;
      return true;
    });
  // Use cost_price × stock (server computes stock_value = cost_price × total_stock)
  const totalValue = products.reduce((s, p) => s + Number(p.stock_value ?? 0), 0);
  const lowStockCount = products.filter(p => p.total_stock <= p.reorder_level).length;
  const outStockCount = products.filter(p => p.total_stock === 0).length;
  const inStockCount = products.filter(p => p.total_stock > p.reorder_level).length;

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

      <div className="inv-stock-filter">
        <button className={filterStock === '' ? 'active' : ''} onClick={() => setFilterStock('')}>All ({products.length})</button>
        <button className={filterStock === 'in' ? 'active' : ''} onClick={() => setFilterStock('in')}>In stock ({inStockCount})</button>
        <button className={filterStock === 'low' ? 'active' : ''} onClick={() => setFilterStock('low')}>Low ({lowStockCount - outStockCount})</button>
        <button className={filterStock === 'out' ? 'active' : ''} onClick={() => setFilterStock('out')}>Out ({outStockCount})</button>
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
                  <th>Added</th>
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
                      <td>{p.type && <TypeBadge type={p.type} />}</td>
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
                      <td style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <br />
                        <span style={{ fontSize: 10 }}>{new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="inv-add-stock-btn" onClick={() => setStockTarget(p)}>+ Stock</button>
                          {isAdmin && (
                            <button
                              className="inv-add-stock-btn"
                              style={{ borderColor: '#dc2626', color: '#dc2626' }}
                              onClick={() => deleteProduct(p)}
                            >Delete</button>
                          )}
                        </div>
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
              const isLow = p.total_stock > 0 && p.total_stock <= p.reorder_level;
              const isOut = p.total_stock === 0;
              const stockClass = isOut ? 'zero' : isLow ? 'low' : 'ok';
              const barWidth = Math.min(100, (p.total_stock / Math.max(p.reorder_level * 3, 1)) * 100);
              return (
                <div key={p.product_id} className={`inv-card${isOut ? ' inv-card-out' : isLow ? ' inv-card-warn' : ''}`}>
                  <div className="inv-card-top">
                    <div className="inv-card-name">
                      {p.name}
                      {(isLow || isOut) && <span className="inv-low-badge" style={{ marginLeft: 6 }}>{isOut ? 'Out of stock' : 'Low stock'}</span>}
                    </div>
                    <div className={`inv-card-stock ${stockClass}`}>
                      <strong>{p.total_stock}</strong>
                      <small>units</small>
                    </div>
                  </div>
                  <div className="inv-card-meta">
                    <code className="inv-sku">{p.sku}</code>
                    {p.type && <TypeBadge type={p.type} />}
                    <span className="inv-card-price">{rupees(p.selling_price)}</span>
                  </div>
                  <div className="inv-stock-bar">
                    <div className={`inv-stock-bar-fill ${stockClass}`} style={{ width: `${barWidth}%` }} />
                  </div>
                  {(p.locations ?? []).length > 0 && (
                    <div className="inv-store-pills">
                      {(p.locations ?? []).map(l => (
                        <span key={l.store_id} className="inv-store-pill">
                          {l.store_name.replace('Lens & Look — ', '')}: {l.quantity}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="inv-card-actions">
                    <button className="inv-add-stock-btn" onClick={() => setStockTarget(p)}>+ Add Stock</button>
                    {isAdmin && (
                      <button className="inv-delete-btn" onClick={() => deleteProduct(p)}>Delete</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showAddProduct && (
        <AddProductModal stores={stores} onClose={() => setShowAddProduct(false)} onSaved={() => { setShowAddProduct(false); void load(); }} />
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
