import { useEffect, useMemo, useState } from 'react';
import { api, type Customer, type Product, type User } from '../api/client';

type CartLine = { product: Product; quantity: number };
type PosView = 'catalog' | 'cart';
type PaymentMode = 'full' | 'advance' | 'custom';

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const CATEGORIES = [
  { label: 'All',       value: '' },
  { label: 'Frames',    value: 'FRAME' },
  { label: 'Lenses',    value: 'LENS' },
  { label: 'Contact',   value: 'CONTACT_LENS' },
  { label: 'Accessory', value: 'ACCESSORY' },
  { label: 'Service',   value: 'SERVICE' },
];

export function Pos({ user }: { user: User }) {
  const [query, setQuery]               = useState('');
  const [allProducts, setAllProducts]   = useState<Product[]>([]);
  const [category, setCategory]         = useState('');
  const [cart, setCart]                 = useState<CartLine[]>([]);
  const [customer, setCustomer]         = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [location, setLocation]         = useState('');
  const [paymentMode, setPaymentMode]   = useState<PaymentMode>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod]             = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'>('UPI');
  const [notice, setNotice]             = useState('');
  const [busy, setBusy]                 = useState(false);
  const [mobileView, setMobileView]     = useState<PosView>('catalog');

  useEffect(() => {
    api.locations().then(x => setLocation(x.data[0]?.id ?? ''));
    api.products().then(x => setAllProducts(x.data));
  }, []);

  useEffect(() => {
    const id = setTimeout(() =>
      api.products(query).then(x => setAllProducts(x.data)).catch(() => undefined), 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const id = setTimeout(() =>
      customerQuery
        ? api.customers(customerQuery).then(x => setCustomers(x.data))
        : setCustomers([]), 250);
    return () => clearTimeout(id);
  }, [customerQuery]);

  // Filter by category client-side (fast, no extra API call)
  const products = useMemo(() => {
    if (!category) return allProducts;
    return allProducts.filter(p => {
      // products API returns product_type via the products table
      const pt = (p as any).product_type ?? '';
      return pt === category;
    });
  }, [allProducts, category]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Number(l.product.selling_price) * l.quantity, 0),
    [cart]
  );

  const paid = useMemo(() => {
    if (paymentMode === 'full')    return subtotal;
    if (paymentMode === 'advance') return 0;
    return Math.min(Number(customAmount || 0), subtotal);
  }, [paymentMode, customAmount, subtotal]);

  const balance = Math.max(0, subtotal - paid);

  const add = (product: Product) => {
    if (product.stock < 1) { setNotice('No stock available for this item.'); return; }
    setNotice('');
    setCart(c => {
      const found = c.find(x => x.product.id === product.id);
      return found
        ? c.map(x => x.product.id === product.id
            ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) }
            : x)
        : [...c, { product, quantity: 1 }];
    });
    setMobileView('cart');
  };

  const checkout = async () => {
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
      setNotice(`✓ ${d.invoiceNumber}  ·  ${user.displayName}  ·  ${fmtTime()}  ·  Paid ${rupees(Number(d.amountPaid))}${Number(d.amountDue) > 0 ? `  ·  Due ${rupees(Number(d.amountDue))}` : ''}`);
      setCart([]); setCustomAmount(''); setCustomer(null);
      setPaymentMode('full');
      setMobileView('catalog');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not post invoice');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos">
      {/* Mobile view toggle */}
      <div className="pos-mobile-tabs">
        <button className={`pos-mobile-tab${mobileView === 'catalog' ? ' active' : ''}`} onClick={() => setMobileView('catalog')}>
          Products
        </button>
        <button className={`pos-mobile-tab${mobileView === 'cart' ? ' active' : ''}`} onClick={() => setMobileView('cart')}>
          Bill {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
        </button>
      </div>

      {/* ── Left: catalogue ── */}
      <div className={`catalog${mobileView === 'catalog' ? ' mob-active' : ' mob-hidden'}`}>

        {/* Category tabs */}
        <div className="cat-tabs">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              className={`cat-tab${category === c.value ? ' active' : ''}`}
              onClick={() => setCategory(c.value)}
            >{c.label}</button>
          ))}
        </div>

        {/* Search */}
        <div className="pos-search-bar">
          <span className="search-icon">⌕</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name…"
          />
          {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
        </div>

        {/* Customer */}
        <div className="customer-row">
          <label>
            Customer
            <input
              value={customer?.full_name ?? customerQuery}
              onChange={e => { setCustomer(null); setCustomerQuery(e.target.value); }}
              placeholder="Search by name or mobile (optional)"
            />
          </label>
          {customer && (
            <button className="customer-clear" onClick={() => { setCustomer(null); setCustomerQuery(''); }}>✕</button>
          )}
          {customers.length > 0 && !customer && (
            <div className="suggestions">
              {customers.map(c => (
                <button key={c.id} onClick={() => { setCustomer(c); setCustomerQuery(''); setCustomers([]); }}>
                  {c.full_name}
                  <small>{c.phone ?? c.customer_code}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Products */}
        <div className="product-grid">
          {products.map(product => (
            <button
              className="product"
              key={product.id}
              onClick={() => add(product)}
              disabled={product.stock < 1}
            >
              <span className={`stock${product.stock > 0 ? '' : ' empty'}`}>
                {product.stock > 0 ? `${product.stock}` : '—'}
              </span>
              <strong>{product.name}</strong>
              {(product.color || product.size) && (
                <small>{[product.color, product.size].filter(Boolean).join(' · ')}</small>
              )}
              <b>{rupees(Number(product.selling_price))}</b>
            </button>
          ))}
          {products.length === 0 && (
            <p className="no-results">
              {allProducts.length === 0 ? 'No products yet. Add from Inventory.' : 'No products in this category.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Right: bill ── */}
      <div className={`cart${mobileView === 'cart' ? ' mob-active' : ' mob-hidden'}`}>
        <div className="cart-header">
          <div>
            <h3>Bill</h3>
            <div className="customer-tag">
              {customer ? `${customer.full_name}${customer.phone ? ` · ${customer.phone}` : ''}` : 'Walk-in'}
            </div>
          </div>
          <button className="cart-clear-btn" onClick={() => { setCart([]); setNotice(''); }} disabled={!cart.length}>
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
                  <button onClick={() => setCart(c =>
                    c.map(x => x.product.id === line.product.id ? { ...x, quantity: x.quantity - 1 } : x)
                     .filter(x => x.quantity > 0))}>−</button>
                  <span>{line.quantity}</span>
                  <button onClick={() => setCart(c =>
                    c.map(x => x.product.id === line.product.id
                      ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) }
                      : x))}>+</button>
                </div>
              </div>
              <div className="cart-line-price">{rupees(Number(line.product.selling_price) * line.quantity)}</div>
            </div>
          ))}
          {!cart.length && (
            <div className="empty-cart">
              <span className="empty-cart-icon">🧾</span>
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
                <button
                  className={`payment-mode-pill${paymentMode === 'full' ? ' active' : ''}`}
                  onClick={() => { setPaymentMode('full'); setCustomAmount(''); }}
                >Full {rupees(subtotal)}</button>
                <button
                  className={`payment-mode-pill${paymentMode === 'advance' ? ' active' : ''}`}
                  onClick={() => { setPaymentMode('advance'); setCustomAmount(''); }}
                >Pending</button>
                <button
                  className={`payment-mode-pill${paymentMode === 'custom' ? ' active' : ''}`}
                  onClick={() => setPaymentMode('custom')}
                >Part pay</button>
              </div>

              {paymentMode === 'custom' && (
                <div className="custom-amount-row">
                  <span className="rupee-prefix">₹</span>
                  <input
                    className="custom-amount-input"
                    inputMode="decimal"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Amount collected"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="balance-summary">
              <div className="balance-row">
                <span>Collecting now</span>
                <strong className="paid-now">{rupees(paid)}</strong>
              </div>
              {balance > 0 && (
                <div className="balance-row">
                  <span>Balance due</span>
                  <strong className="balance-due">{rupees(balance)}</strong>
                </div>
              )}
            </div>

            <div className="method-section">
              <div className="payment-mode-label">Via</div>
              <div className="method-pills">
                {(['UPI', 'CASH', 'CARD'] as const).map(m => (
                  <button key={m} className={method === m ? 'selected' : ''} onClick={() => setMethod(m)}>{m}</button>
                ))}
              </div>
            </div>

            <button className="checkout-btn" disabled={busy} onClick={checkout}>
              {busy ? 'Posting…' : paymentMode === 'advance' ? 'Post Bill — Collect Later' : `Post & Collect ${rupees(paid)}`}
            </button>

            {notice && (
              <p className={notice.startsWith('✓') ? 'success' : 'error'} style={{ fontSize: 12, lineHeight: 1.5 }}>{notice}</p>
            )}
          </div>
        )}

        {notice && !cart.length && (
          <p className={`cart-notice ${notice.startsWith('✓') ? 'success' : 'error'}`}>{notice}</p>
        )}
      </div>
    </div>
  );
}
