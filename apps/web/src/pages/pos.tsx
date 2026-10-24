import { useEffect, useMemo, useState } from 'react';
import { api, type Customer, type Product, type User } from '../api/client';

type CartLine = { product: Product; quantity: number };
type PosView = 'catalog' | 'cart';
type PaymentMode = 'full' | 'advance' | 'custom';

interface OrderResult {
  invoiceNumber: string;
  grandTotal: string;
  amountPaid: string;
  amountDue: string;
  paymentStatus: string;
  method: string;
  customerName: string | null;
  customerPhone: string | null;
  items: { name: string; qty: number; price: number }[];
  cashier: string;
  time: string;
}

const rupees = (n: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n));

const fmtNow = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CATS = [
  { label: 'All',       value: '' },
  { label: 'Frames',    value: 'FRAME' },
  { label: 'Lenses',    value: 'LENS' },
  { label: 'Contact',   value: 'CONTACT_LENS' },
  { label: 'Accessory', value: 'ACCESSORY' },
  { label: 'Service',   value: 'SERVICE' },
];

function buildWhatsAppUrl(order: OrderResult): string {
  const rupeesFmt = (v: string | number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

  const lines = order.items.map(i => `  • ${i.name} ×${i.qty} — ${rupeesFmt(i.price * i.qty)}`).join('\n');
  const due = Number(order.amountDue) > 0 ? `\n💰 *Balance due: ${rupeesFmt(order.amountDue)}*` : '';

  const msg = [
    `🧾 *Receipt from Lens&Look*`,
    `Invoice: ${order.invoiceNumber}`,
    `Date: ${order.time}`,
    ``,
    `*Items:*`,
    lines,
    ``,
    `*Total: ${rupeesFmt(order.grandTotal)}*`,
    `Paid: ${rupeesFmt(order.amountPaid)}${due}`,
    ``,
    `Thank you for visiting Lens&Look! 🙏`,
  ].join('\n');

  const phone = (order.customerPhone ?? '').replace(/\D/g, '');
  const intlPhone = phone.startsWith('91') ? phone : `91${phone}`;
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
}

// ── Order Confirmed modal ─────────────────────────────────────────────────────
function OrderConfirmed({ order, onClose }: { order: OrderResult; onClose: () => void }) {
  const isPaid    = order.paymentStatus === 'PAID';
  const isPending = order.paymentStatus === 'UNPAID';
  const [waSent, setWaSent] = useState(false);
  // Allow walk-in cashier to type a phone and still send WA
  const [waPhone, setWaPhone] = useState(order.customerPhone ?? '');

  function sendWhatsApp() {
    const phone = waPhone.replace(/\D/g, '');
    if (!phone || phone.length < 10) return;
    const url = buildWhatsAppUrl({ ...order, customerPhone: phone });
    window.open(url, '_blank', 'noopener,noreferrer');
    setWaSent(true);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="order-confirmed-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="oc-header">
          <div className={`oc-icon ${isPaid ? 'paid' : isPending ? 'pending' : 'partial'}`}>
            {isPaid ? '✓' : isPending ? '○' : '◑'}
          </div>
          <h2 className="oc-title">{isPaid ? 'Bill posted' : isPending ? 'Bill posted — collect later' : 'Bill posted — partial payment'}</h2>
          <div className="oc-invoice">{order.invoiceNumber}</div>
          <div className="oc-time">{order.time} · {order.cashier}</div>
        </div>

        {/* Customer */}
        {(order.customerName || order.customerPhone) && (
          <div className="oc-section">
            <div className="oc-section-label">Customer</div>
            <div className="oc-customer-name">{order.customerName ?? '—'}</div>
            {order.customerPhone && <div className="oc-customer-phone">{order.customerPhone}</div>}
          </div>
        )}

        {/* Items */}
        <div className="oc-section">
          <div className="oc-section-label">Items ({order.items.length})</div>
          {order.items.map((item, i) => (
            <div key={i} className="oc-item-row">
              <span className="oc-item-name">{item.name}</span>
              <span className="oc-item-qty">×{item.qty}</span>
              <span className="oc-item-price">{rupees(item.price * item.qty)}</span>
            </div>
          ))}
        </div>

        {/* Payment summary */}
        <div className="oc-section oc-payment-summary">
          <div className="oc-pay-row">
            <span>Total</span>
            <strong>{rupees(order.grandTotal)}</strong>
          </div>
          <div className="oc-pay-row">
            <span>Paid now{order.amountPaid !== '0.00' && order.amountPaid !== order.grandTotal ? ` · ${order.method}` : ''}</span>
            <strong className={isPending ? 'oc-pending' : 'oc-paid'}>{rupees(order.amountPaid)}</strong>
          </div>
          {Number(order.amountDue) > 0 && (
            <div className="oc-pay-row oc-due-row">
              <span>Balance due</span>
              <strong className="oc-due">{rupees(order.amountDue)}</strong>
            </div>
          )}
        </div>

        {/* WhatsApp — optional, always available */}
        <div className="oc-wa-wrap">
          {!order.customerPhone && (
            <input
              className="oc-wa-input"
              type="tel"
              inputMode="tel"
              placeholder="Enter mobile to send WhatsApp receipt"
              value={waPhone}
              onChange={e => { setWaSent(false); setWaPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
              maxLength={10}
            />
          )}
          <button
            className={`oc-wa-btn${waSent ? ' sent' : ''}`}
            onClick={sendWhatsApp}
            disabled={waPhone.replace(/\D/g, '').length < 10}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            {waSent ? 'Opened WhatsApp ✓' : 'Send receipt on WhatsApp'}
          </button>
          <p className="oc-wa-note">Optional — opens WhatsApp with receipt pre-filled</p>
        </div>

        <button className="oc-close-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ── Customer form ─────────────────────────────────────────────────────────────
function CustomerForm({ initial, onDone }: {
  initial: { fullName: string; phone: string; address: string } | null;
  onDone: (c: { fullName: string; phone: string; address: string } | null, existing?: Customer) => void;
}) {
  const [tab, setTab]   = useState<'search' | 'new'>(initial ? 'new' : 'search');
  const [q, setQ]       = useState('');
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
          <h3>Customer</h3>
          <button className="modal-close" onClick={() => onDone(null)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="cust-tabs">
            <button className={`cust-tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>Find existing</button>
            <button className={`cust-tab${tab === 'new' ? ' active' : ''}`} onClick={() => setTab('new')}>New customer</button>
          </div>
          {tab === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="cust-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or mobile number…" autoFocus />
              {results.map(c => (
                <button key={c.id} className="cust-result-row" onClick={() => onDone(null, c)}>
                  <div className="cust-result-name">{c.full_name}</div>
                  <div className="cust-result-phone">{c.phone ?? c.customer_code}</div>
                </button>
              ))}
              {q.length > 1 && results.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--ink-4)', textAlign: 'center' }}>Not found — add as new customer</p>
              )}
            </div>
          )}
          {tab === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label>Full Name *</label>
                <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label>Mobile * (10 digits)</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0,10) }))} inputMode="tel" />
              </div>
              <div className="form-group">
                <label>Address (optional)</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <button className="btn-primary" style={{ width: '100%' }} disabled={busy || !form.fullName.trim() || form.phone.length < 10}
                onClick={async () => {
                  setBusy(true);
                  try { const r = await api.createCustomer({ fullName: form.fullName.trim(), phone: form.phone || undefined }); onDone(null, r.data); }
                  catch { onDone(form); }
                  finally { setBusy(false); }
                }}>{busy ? 'Saving…' : 'Save & continue'}</button>
              <button className="btn-outline" style={{ width: '100%' }} onClick={() => onDone(form)}>Continue without saving</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main POS ──────────────────────────────────────────────────────────────────
export function Pos({ user }: { user: User }) {
  const [allProducts, setAllProducts]   = useState<Product[]>([]);
  const [query, setQuery]               = useState('');
  const [category, setCategory]         = useState('');
  const [cart, setCart]                 = useState<CartLine[]>([]);
  const [customer, setCustomer]         = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<{ fullName: string; phone: string; address: string } | null>(null);
  const [showCustModal, setShowCustModal] = useState(false);
  const [location, setLocation]         = useState('');
  const [paymentMode, setPaymentMode]   = useState<PaymentMode>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod]             = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'>('UPI');
  const [busy, setBusy]                 = useState(false);
  const [orderResult, setOrderResult]   = useState<OrderResult | null>(null);
  const [mobileView, setMobileView]     = useState<PosView>('catalog');
  const [error, setError]               = useState('');

  useEffect(() => {
    api.locations().then(x => setLocation(x.data[0]?.id ?? ''));
    api.products().then(x => setAllProducts(x.data));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => api.products(query).then(x => setAllProducts(x.data)).catch(() => undefined), 250);
    return () => clearTimeout(id);
  }, [query]);

  const products = useMemo(() =>
    category ? allProducts.filter(p => (p as any).product_type === category) : allProducts,
    [allProducts, category]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + Number(l.product.selling_price) * l.quantity, 0), [cart]);

  const paid = useMemo(() => {
    if (paymentMode === 'full')    return subtotal;
    if (paymentMode === 'advance') return 0;
    return Math.min(Number(customAmount || 0), subtotal);
  }, [paymentMode, customAmount, subtotal]);

  const balance = Math.max(0, subtotal - paid);

  const add = (product: Product) => {
    if (product.stock < 1) return;
    setError('');
    setCart(c => {
      const found = c.find(x => x.product.id === product.id);
      return found
        ? c.map(x => x.product.id === product.id ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) } : x)
        : [...c, { product, quantity: 1 }];
    });
    setMobileView('cart');
  };

  const handleCheckoutPress = () => {
    if (!cart.length || !location) return;
    if (!customer && !customerForm) { setShowCustModal(true); return; }
    void doCheckout();
  };

  const doCheckout = async () => {
    if (!cart.length || !location) return;
    setBusy(true); setError('');
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
      setOrderResult({
        invoiceNumber: d.invoiceNumber,
        grandTotal: d.grandTotal,
        amountPaid: d.amountPaid,
        amountDue: d.amountDue,
        paymentStatus: d.paymentStatus,
        method,
        customerName: customer?.full_name ?? customerForm?.fullName ?? null,
        customerPhone: customer?.phone ?? (customerForm?.phone || null),
        items: cart.map(l => ({ name: l.product.name, qty: l.quantity, price: Number(l.product.selling_price) })),
        cashier: user.displayName,
        time: fmtNow(),
      });
      setCart([]); setCustomAmount(''); setCustomer(null); setCustomerForm(null);
      setPaymentMode('full'); setMobileView('catalog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post invoice');
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
    <>
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

        {/* ── Products ── */}
        <div className={`catalog${mobileView === 'catalog' ? ' mob-active' : ' mob-hidden'}`}>
          <div className="cat-tabs">
            {CATS.map(c => (
              <button key={c.value} className={`cat-tab${category === c.value ? ' active' : ''}`} onClick={() => setCategory(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="pos-search-bar">
            <span className="search-icon">⌕</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
            {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
          </div>
          <div className="product-grid">
            {products.map(product => (
              <button
                className={`product${product.stock < 1 ? ' out-of-stock' : ''}`}
                key={product.id}
                onClick={() => add(product)}
                disabled={product.stock < 1}
              >
                {product.stock > 0 && <span className="stock-badge">{product.stock}</span>}
                <strong>{product.name}</strong>
                {(product.color || product.size) && <small>{[product.color, product.size].filter(Boolean).join(' · ')}</small>}
                <b>{rupees(Number(product.selling_price))}</b>
              </button>
            ))}
            {products.length === 0 && (
              <p className="no-results">{allProducts.length === 0 ? 'No products yet.' : 'None in this category.'}</p>
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
                  ? <span className="cust-set">👤 {customerLabel}</span>
                  : <button className="add-cust-btn" onClick={() => setShowCustModal(true)}>+ Add customer</button>
                }
              </div>
            </div>
            <button className="cart-clear-btn" onClick={() => { setCart([]); setError(''); setCustomer(null); setCustomerForm(null); }} disabled={!cart.length}>Clear</button>
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
            {!cart.length && <div className="empty-cart"><p>Tap products to add them.</p></div>}
          </div>

          {cart.length > 0 && (
            <div className="cart-footer">
              <div className="totals-row"><span>Total ({cart.reduce((s,l)=>s+l.quantity,0)} items)</span><strong>{rupees(subtotal)}</strong></div>

              <div className="payment-mode-section">
                <div className="payment-mode-label">Collect</div>
                <div className="payment-mode-pills">
                  <button className={`payment-mode-pill${paymentMode === 'full' ? ' active' : ''}`} onClick={() => { setPaymentMode('full'); setCustomAmount(''); }}>Full {rupees(subtotal)}</button>
                  <button className={`payment-mode-pill${paymentMode === 'advance' ? ' active' : ''}`} onClick={() => { setPaymentMode('advance'); setCustomAmount(''); }}>Pending</button>
                  <button className={`payment-mode-pill${paymentMode === 'custom' ? ' active' : ''}`} onClick={() => setPaymentMode('custom')}>Part pay</button>
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

              {/* PhonePe QR — shown when UPI is selected and amount > 0 */}
              {method === 'UPI' && paid > 0 && (
                <div className="phonepe-qr-wrap">
                  <div className="phonepe-qr-header">
                    <span className="phonepe-qr-label">Scan to pay</span>
                    <strong className="phonepe-qr-amount">{rupees(paid)}</strong>
                  </div>
                  <img
                    src={`${import.meta.env.BASE_URL}phonepe-qr.png`}
                    alt="PhonePe UPI QR — Lens N Look"
                    className="phonepe-qr-img"
                  />
                  <div className="phonepe-qr-footer">PhonePe · BHIM UPI · Terminal 3-Q452527909</div>
                </div>
              )}

              {error && <p className="error">{error}</p>}

              <button className="checkout-btn" disabled={busy} onClick={handleCheckoutPress}>
                {busy ? 'Posting…' : !customer && !customerForm ? 'Add customer & post' : paymentMode === 'advance' ? 'Post — collect later' : `Post & collect ${rupees(paid)}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Order confirmed popup */}
      {orderResult && <OrderConfirmed order={orderResult} onClose={() => setOrderResult(null)} />}

      {showCustModal && (
        <CustomerForm
          initial={customerForm}
          onDone={(formData, existingCustomer) => {
            setShowCustModal(false);
            if (existingCustomer) { setCustomer(existingCustomer); setCustomerForm(null); }
            else if (formData) { setCustomerForm(formData); }
            setTimeout(() => void doCheckout(), 50);
          }}
        />
      )}
    </>
  );
}
