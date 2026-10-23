import { useEffect, useMemo, useState } from 'react';
import { api, type Customer, type Product, type User } from '../api/client';

type CartLine = { product: Product; quantity: number };
type PosView = 'catalog' | 'cart';
type PaymentMode = 'full' | 'advance' | 'custom';

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const CATS = [
  { label: 'All',       value: '' },
  { label: 'Frames',    value: 'FRAME' },
  { label: 'Lenses',    value: 'LENS' },
  { label: 'Contact',   value: 'CONTACT_LENS' },
  { label: 'Accessory', value: 'ACCESSORY' },
  { label: 'Service',   value: 'SERVICE' },
];

// ── Customer form shown before billing ────────────────────────────────────────
function CustomerForm({ initial, onDone }: {
  initial: { fullName: string; phone: string; address: string } | null;
  onDone: (c: { fullName: string; phone: string; address: string } | null, existing?: Customer) => void;
}) {
  const [tab, setTab] = useState<'new' | 'search'>(initial ? 'new' : 'search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [form, setForm] = useState({ fullName: initial?.fullName ?? '', phone: initial?.phone ?? '', address: initial?.address ?? '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'search' || !q.trim()) { setResults([]); return; }
    const id = setTimeout(() => api.customers(q).then(r => setResults(r.data)).catch(() => setResults([])), 250);
    return () => clearTimeout(id);
  }, [q, tab]);

  return (
    <div className="modal-overlay" onClick={() => onDone(null)}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Customer details</h3>
          <button className="modal-close" onClick={() => onDone(null)}>✕</button>
        </div>
        <div className="modal-body">
          {/* Tab switcher */}
          <div className="cust-tabs">
            <button className={`cust-tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>Existing customer</button>
            <button className={`cust-tab${tab === 'new' ? ' active' : ''}`} onClick={() => setTab('new')}>New customer</button>
          </div>

          {tab === 'search' && (
            <>
              <input
                className="cust-search-input"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by name or mobile…"
                autoFocus
              />
              {results.map(c => (
                <button key={c.id} className="cust-result-row" onClick={() => onDone(null, c)}>
                  <div className="cust-result-name">{c.full_name}</div>
                  <div className="cust-result-phone">{c.phone ?? c.customer_code}</div>
                </button>
              ))}
              {q.length > 0 && results.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--ink-4)', textAlign: 'center', padding: '12px 0' }}>
                  No customer found — switch to "New customer"
                </p>
              )}
            </>
          )}

          {tab === 'new' && (
            <>
              <div className="form-group">
                <label>Full Name *</label>
                <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="" autoFocus />
              </div>
              <div className="form-group">
                <label>Mobile *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0,10) }))} inputMode="tel" placeholder="10-digit number" />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Optional" />
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', marginTop: 4 }}
                disabled={busy || !form.fullName.trim() || form.phone.length < 10}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api.createCustomer({ fullName: form.fullName.trim(), phone: form.phone || undefined });
                    onDone(null, r.data);
                  } catch {
                    // If creation fails, still proceed with inline form data
                    onDone(form);
                  } finally { setBusy(false); }
                }}
              >{busy ? 'Saving…' : 'Save & continue'}</button>
              <button className="btn-outline" style={{ width: '100%' }} onClick={() => onDone(form)}>
                Continue without saving
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Pos({ user }: { user: User }) {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [query, setQuery]             = useState('');
  const [category, setCategory]       = useState('');
  const [cart, setCart]               = useState<CartLine[]>([]);
  const [customer, setCustomer]       = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<{ fullName: string; phone: string; address: string } | null>(null);
  const [showCustModal, setShowCustModal] = useState(false);
  const [location, setLocation]       = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod]           = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'>('UPI');
  const [notice, setNotice]           = useState('');
  const [busy, setBusy]               = useState(false);
  const [mobileView, setMobileView]   = useState<PosView>('catalog');

  useEffect(() => {
    api.locations().then(x => setLocation(x.data[0]?.id ?? ''));
    api.products().then(x => setAllProducts(x.data));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => api.products(query).then(x => setAllProducts(x.data)).catch(() => undefined), 250);
    return () => clearTimeout(id);
  }, [query]);

  const products = useMemo(() => {
    if (!category) return allProducts;
    return allProducts.filter(p => (p as any).product_type === category);
  }, [allProducts, category]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + Number(l.product.selling_price) * l.quantity, 0), [cart]);

  const paid = useMemo(() => {
    if (paymentMode === 'full')    return subtotal;
    if (paymentMode === 'advance') return 0;
    return Math.min(Number(customAmount || 0), subtotal);
  }, [paymentMode, customAmount, subtotal]);

  const balance = Math.max(0, subtotal - paid);

  const add = (product: Product) => {
    if (product.stock < 1) return; // card is disabled, shouldn't reach here
    setCart(c => {
      const found = c.find(x => x.product.id === product.id);
      return found
        ? c.map(x => x.product.id === product.id ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) } : x)
        : [...c, { product, quantity: 1 }];
    });
    setMobileView('cart');
  };

  // When user tries to checkout — ask for customer details first
  const handleCheckoutPress = () => {
    if (!cart.length || !location) return;
    if (!customer && !customerForm) { setShowCustModal(true); return; }
    void doCheckout();
  };

  const doCheckout = async () => {
    if (!cart.length || !location) return;
    setBusy(true); setNotice('');
    try {
      const outcome = await api.postInvoice(
        {
          customerId: customer?.id,
          locationId: location,
          items: cart.map(x => ({ variantId: x.product.id, quantity: x.quantity })),
          payments: paid > 0 ? [{ amount: paid.toFixed(2), method }] : [],
        },
        crypto.randomUUID() + crypto.randomUUID().replace('-', '')
      );
      const d = outcome.data;
      setNotice(`✓  ${d.invoiceNumber}  ·  ${user.displayName}  ·  ${fmtTime()}  ·  Paid ${rupees(Number(d.amountPaid))}${Number(d.amountDue) > 0 ? `  ·  Due ${rupees(Number(d.amountDue))}` : ''}`);
      setCart([]); setCustomAmount(''); setCustomer(null); setCustomerForm(null);
      setPaymentMode('full'); setMobileView('catalog');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not post invoice');
    } finally {
      setBusy(false);
    }
  };

  const customerLabel = customer
    ? `${customer.full_name}${customer.phone ? ` · ${customer.phone}` : ''}`
    : customerForm
    ? `${customerForm.fullName}${customerForm.phone ? ` · ${customerForm.phone}` : ''}`
    : null;

  return (
    <div className="pos">
      {/* Mobile toggle */}
      <div className="pos-mobile-tabs">
        <button className={`pos-mobile-tab${mobileView === 'catalog' ? ' active' : ''}`} onClick={() => setMobileView('catalog')}>
          Products
        </button>
        <button className={`pos-mobile-tab${mobileView === 'cart' ? ' active' : ''}`} onClick={() => setMobileView('cart')}>
          Bill {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
        </button>
      </div>

      {/* ── Catalogue ── */}
      <div className={`catalog${mobileView === 'catalog' ? ' mob-active' : ' mob-hidden'}`}>
        {/* Category tabs */}
        <div className="cat-tabs">
          {CATS.map(c => (
            <button key={c.value} className={`cat-tab${category === c.value ? ' active' : ''}`} onClick={() => setCategory(c.value)}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="pos-search-bar">
          <span className="search-icon">⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name…" />
          {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
        </div>

        {/* Products */}
        <div className="product-grid">
          {products.map(product => (
            <button
              className={`product${product.stock < 1 ? ' out-of-stock' : ''}`}
              key={product.id}
              onClick={() => add(product)}
              disabled={product.stock < 1}
            >
              {product.stock > 0 && (
                <span className="stock-badge">{product.stock}</span>
              )}
              <strong>{product.name}</strong>
              {(product.color || product.size) && (
                <small>{[product.color, product.size].filter(Boolean).join(' · ')}</small>
              )}
              <b>{rupees(Number(product.selling_price))}</b>
            </button>
          ))}
          {products.length === 0 && (
            <p className="no-results">
              {allProducts.length === 0 ? 'No products yet — add from Inventory.' : 'None in this category.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Bill ── */}
      <div className={`cart${mobileView === 'cart' ? ' mob-active' : ' mob-hidden'}`}>
        <div className="cart-header">
          <div>
            <h3>Bill</h3>
            <div className="customer-tag">
              {customerLabel
                ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>👤 {customerLabel}</span>
                : <button className="add-cust-btn" onClick={() => setShowCustModal(true)}>+ Add customer</button>
              }
            </div>
          </div>
          <button className="cart-clear-btn" onClick={() => { setCart([]); setNotice(''); setCustomer(null); setCustomerForm(null); }} disabled={!cart.length}>
            Clear
          </button>
        </div>

        <div className="cart-lines">
          {cart.map(line => (
            <div className="cart-line" key={line.product.id}>
              <div className="cart-line-info">
                <div className="cart-line-name">{line.product.name}</div>
                {(line.product.color || line.product.size) && (
                  <div className="cart-line-sku">{[line.product.color, line.product.size].filter(Boolean).join(' · ')}</div>
                )}
                <div className="cart-line-sku">{rupees(Number(line.product.selling_price))} each</div>
                <div className="qty">
                  <button onClick={() => setCart(c => c.map(x => x.product.id === line.product.id ? { ...x, quantity: x.quantity - 1 } : x).filter(x => x.quantity > 0))}>−</button>
                  <span>{line.quantity}</span>
                  <button onClick={() => setCart(c => c.map(x => x.product.id === line.product.id ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) } : x))}>+</button>
                </div>
              </div>
              <div className="cart-line-price">{rupees(Number(line.product.selling_price) * line.quantity)}</div>
            </div>
          ))}
          {!cart.length && (
            <div className="empty-cart">
              <p>Select products to build the bill.</p>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer">
            <div className="totals-row"><span>Total</span><strong>{rupees(subtotal)}</strong></div>

            <div className="payment-mode-section">
              <div className="payment-mode-label">Collect</div>
              <div className="payment-mode-pills">
                <button className={`payment-mode-pill${paymentMode === 'full' ? ' active' : ''}`} onClick={() => { setPaymentMode('full'); setCustomAmount(''); }}>
                  Full {rupees(subtotal)}
                </button>
                <button className={`payment-mode-pill${paymentMode === 'advance' ? ' active' : ''}`} onClick={() => { setPaymentMode('advance'); setCustomAmount(''); }}>
                  Pending
                </button>
                <button className={`payment-mode-pill${paymentMode === 'custom' ? ' active' : ''}`} onClick={() => setPaymentMode('custom')}>
                  Part pay
                </button>
              </div>
              {paymentMode === 'custom' && (
                <div className="custom-amount-row">
                  <span className="rupee-prefix">₹</span>
                  <input className="custom-amount-input" inputMode="decimal" value={customAmount} onChange={e => setCustomAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Amount collected" autoFocus />
                </div>
              )}
            </div>

            <div className="balance-summary">
              <div className="balance-row"><span>Collecting now</span><strong className="paid-now">{rupees(paid)}</strong></div>
              {balance > 0 && <div className="balance-row"><span>Balance due</span><strong className="balance-due">{rupees(balance)}</strong></div>}
            </div>

            <div className="method-section">
              <div className="payment-mode-label">Via</div>
              <div className="method-pills">
                {(['UPI', 'CASH', 'CARD'] as const).map(m => (
                  <button key={m} className={method === m ? 'selected' : ''} onClick={() => setMethod(m)}>{m}</button>
                ))}
              </div>
            </div>

            <button className="checkout-btn" disabled={busy} onClick={handleCheckoutPress}>
              {busy ? 'Posting…' : !customer && !customerForm ? 'Add customer & post' : paymentMode === 'advance' ? 'Post — collect later' : `Post & collect ${rupees(paid)}`}
            </button>

            {notice && (
              <p className={`bill-notice ${notice.startsWith('✓') ? 'success' : 'error'}`}>{notice}</p>
            )}
          </div>
        )}

        {notice && !cart.length && (
          <p className={`cart-notice ${notice.startsWith('✓') ? 'success' : 'error'}`}>{notice}</p>
        )}
      </div>

      {showCustModal && (
        <CustomerForm
          initial={customerForm}
          onDone={(formData, existingCustomer) => {
            setShowCustModal(false);
            if (existingCustomer) { setCustomer(existingCustomer); setCustomerForm(null); }
            else if (formData) { setCustomerForm(formData); }
            // After setting customer, proceed to checkout
            setTimeout(() => void doCheckout(), 50);
          }}
        />
      )}
    </div>
  );
}
