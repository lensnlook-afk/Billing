import { useEffect, useMemo, useState } from 'react';
import { api, type Customer, type Product } from '../api/client';

type CartLine = { product: Product; quantity: number };

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

export function Pos() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [location, setLocation] = useState('');
  const [payment, setPayment] = useState('');
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'>('UPI');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.locations().then(x => setLocation(x.data[0]?.id ?? ''));
    api.products().then(x => setProducts(x.data));
  }, []);

  useEffect(() => {
    const id = setTimeout(() =>
      api.products(query).then(x => setProducts(x.data)).catch(() => undefined), 180);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const id = setTimeout(() =>
      customerQuery
        ? api.customers(customerQuery).then(x => setCustomers(x.data))
        : setCustomers([]), 180);
    return () => clearTimeout(id);
  }, [customerQuery]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Number(l.product.selling_price) * l.quantity, 0),
    [cart]
  );

  const add = (product: Product) => {
    if (product.stock < 1) { setNotice('This item has no available stock.'); return; }
    setCart(c => {
      const found = c.find(x => x.product.id === product.id);
      return found
        ? c.map(x => x.product.id === product.id
            ? { ...x, quantity: Math.min(x.quantity + 1, x.product.stock) }
            : x)
        : [...c, { product, quantity: 1 }];
    });
  };

  const paid = Number(payment || 0);
  const due  = Math.max(0, subtotal - paid);

  const checkout = async () => {
    if (!cart.length || !location) return;
    if (paid > subtotal) { setNotice('Payment cannot exceed total.'); return; }
    setBusy(true); setNotice('');
    try {
      const outcome = await api.postInvoice(
        {
          customerId: customer?.id,
          locationId: location,
          items: cart.map(x => ({ variantId: x.product.id, quantity: x.quantity })),
          payments: paid ? [{ amount: paid.toFixed(2), method }] : [],
        },
        crypto.randomUUID() + crypto.randomUUID().replace('-', '')
      );
      setNotice(`✓ ${outcome.data.invoiceNumber} posted · ${outcome.data.paymentStatus.replace('_', ' ')}`);
      setCart([]); setPayment(''); setCustomer(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not post invoice');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos">
      {/* ── Left: catalogue ── */}
      <div className="catalog">
        {/* Search */}
        <div className="pos-search-bar">
          <span className="search-icon">🔍</span>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Scan barcode or search product / SKU…"
          />
          <kbd>F2</kbd>
        </div>

        {/* Customer */}
        <div className="customer-row">
          <label>
            Customer
            <input
              value={customer?.name ?? customerQuery}
              onChange={e => { setCustomer(null); setCustomerQuery(e.target.value); }}
              placeholder="Optional — search by name or mobile"
            />
          </label>
          {customers.length > 0 && !customer && (
            <div className="suggestions">
              {customers.map(c => (
                <button key={c.id} onClick={() => { setCustomer(c); setCustomerQuery(''); setCustomers([]); }}>
                  {c.name}
                  <small>{c.mobile ?? `C-${c.customer_no}`}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Products */}
        <div className="product-grid">
          {products.map(product => (
            <button className="product" key={product.id} onClick={() => add(product)}>
              <span className={`stock${product.stock > 0 ? '' : ' empty'}`}>
                {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
              </span>
              <strong>{product.name}</strong>
              <small>{[product.variant, product.color, product.sku].filter(Boolean).join(' · ')}</small>
              <b>{rupees(Number(product.selling_price))}</b>
            </button>
          ))}
          {!products.length && <p className="no-results">No matching products found.</p>}
        </div>
      </div>

      {/* ── Right: cart ── */}
      <div className="cart">
        <div className="cart-header">
          <div>
            <h3>Current sale</h3>
            <div className="customer-tag">
              {customer ? customer.name : 'Walk-in customer'}
            </div>
          </div>
          <button onClick={() => setCart([])} disabled={!cart.length}>Clear</button>
        </div>

        <div className="cart-lines">
          {cart.map(line => (
            <div className="cart-line" key={line.product.id}>
              <div>
                <div className="cart-line-name">{line.product.name}</div>
                <div className="cart-line-sku">{line.product.sku} · {rupees(Number(line.product.selling_price))}</div>
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
              <div className="cart-line-price">
                {rupees(Number(line.product.selling_price) * line.quantity)}
              </div>
            </div>
          ))}
          {!cart.length && (
            <div className="empty-cart">
              Scan or tap a product<br />to start a bill.
            </div>
          )}
        </div>

        <div className="cart-footer">
          <div className="totals-row"><span>Subtotal</span><span>{rupees(subtotal)}</span></div>
          <div className="totals-row grand"><span>Amount due</span><span>{rupees(due)}</span></div>

          <div className="payment-section">
            <label>
              Receive payment
              <input
                inputMode="decimal"
                value={payment}
                onChange={e => setPayment(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="method-pills">
            {(['UPI', 'CASH', 'CARD'] as const).map(m => (
              <button
                key={m}
                className={method === m ? 'selected' : ''}
                onClick={() => setMethod(m)}
              >{m}</button>
            ))}
          </div>

          <button
            className="checkout-btn"
            disabled={!cart.length || busy}
            onClick={checkout}
          >
            {busy ? 'Posting secure sale…' : `Collect ${rupees(paid)} & post invoice`}
          </button>

          {notice && (
            <p className={notice.startsWith('✓') ? 'success' : 'error'}>{notice}</p>
          )}
        </div>
      </div>
    </div>
  );
}
