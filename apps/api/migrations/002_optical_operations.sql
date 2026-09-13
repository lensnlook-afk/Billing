-- Lens&Look optical-retail operations. Financial values remain numeric(14,2),
-- while all external payment and refund references remain append-only.

CREATE TYPE order_status AS ENUM ('DRAFT','CONFIRMED','ADVANCE_PAID','PROCESSING','READY','DELIVERED','COMPLETED','CANCELLED','REFUNDED','RETURNED');
CREATE TYPE fulfillment_type AS ENUM ('IN_STOCK','CUSTOM','SUPPLIER_ORDER');
CREATE TYPE purchase_order_status AS ENUM ('DRAFT','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED');
CREATE TYPE return_status AS ENUM ('REQUESTED','APPROVED','RECEIVED','REJECTED','COMPLETED');
CREATE TYPE refund_status AS ENUM ('PENDING_APPROVAL','APPROVED','PAID','REJECTED');
CREATE TYPE adjustment_status AS ENUM ('PENDING_APPROVAL','APPROVED','REJECTED','APPLIED');
CREATE TYPE notification_status AS ENUM ('PENDING','SENT','FAILED','READ');

CREATE TABLE customer_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id),
  prescribed_by text, prescribed_on date, right_eye jsonb NOT NULL DEFAULT '{}'::jsonb,
  left_eye jsonb NOT NULL DEFAULT '{}'::jsonb, pd numeric(6,2), lens_type text, lens_material text,
  coating text, tint text, parameters jsonb NOT NULL DEFAULT '{}'::jsonb, notes text,
  captured_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE INDEX prescriptions_customer_idx ON customer_prescriptions(customer_id, created_at DESC);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL UNIQUE, customer_id uuid REFERENCES customers(id),
  prescription_id uuid REFERENCES customer_prescriptions(id), status order_status NOT NULL DEFAULT 'DRAFT',
  fulfillment fulfillment_type NOT NULL DEFAULT 'IN_STOCK', delivery_due_at timestamptz, delivered_at timestamptz,
  notes text, created_by uuid NOT NULL REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz, cancellation_reason text
);
CREATE INDEX orders_status_due_idx ON orders(status, delivery_due_at); CREATE INDEX orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), variant_id uuid REFERENCES product_variants(id),
  prescription_snapshot jsonb, fulfillment fulfillment_type NOT NULL DEFAULT 'IN_STOCK', quantity integer NOT NULL CHECK(quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK(unit_price >= 0), discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount >= 0), tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(tax_rate >= 0), line_total numeric(14,2) NOT NULL CHECK(line_total >= 0), notes text
);
ALTER TABLE invoices ADD COLUMN order_id uuid REFERENCES orders(id);
CREATE INDEX invoices_order_idx ON invoices(order_id);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_number text NOT NULL UNIQUE, supplier_id uuid NOT NULL REFERENCES suppliers(id),
  status purchase_order_status NOT NULL DEFAULT 'DRAFT', ordered_at timestamptz, expected_at timestamptz, notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK(subtotal >= 0), tax_total numeric(14,2) NOT NULL DEFAULT 0 CHECK(tax_total >= 0), grand_total numeric(14,2) NOT NULL DEFAULT 0 CHECK(grand_total >= 0), created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz
);
CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id), variant_id uuid REFERENCES product_variants(id),
  description text NOT NULL, quantity_ordered integer NOT NULL CHECK(quantity_ordered > 0), quantity_received integer NOT NULL DEFAULT 0 CHECK(quantity_received >= 0),
  unit_cost numeric(14,2) NOT NULL CHECK(unit_cost >= 0), tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(tax_rate >= 0)
);
CREATE TABLE goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_number text NOT NULL UNIQUE, purchase_order_id uuid REFERENCES purchase_orders(id),
  supplier_invoice_number text, location_id uuid NOT NULL REFERENCES locations(id), received_by uuid NOT NULL REFERENCES users(id), received_at timestamptz NOT NULL DEFAULT now(), notes text
);
CREATE TABLE goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id), variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity_received integer NOT NULL CHECK(quantity_received > 0), accepted_quantity integer NOT NULL CHECK(accepted_quantity >= 0 AND accepted_quantity <= quantity_received), rejected_quantity integer NOT NULL DEFAULT 0 CHECK(rejected_quantity >= 0), unit_cost numeric(14,2) NOT NULL CHECK(unit_cost >= 0), notes text
);
CREATE INDEX goods_receipt_variant_idx ON goods_receipt_items(variant_id);

CREATE TABLE returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_number text NOT NULL UNIQUE, invoice_id uuid NOT NULL REFERENCES invoices(id), customer_id uuid REFERENCES customers(id),
  status return_status NOT NULL DEFAULT 'REQUESTED', reason text NOT NULL, requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id),
  received_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES returns(id), invoice_item_id uuid NOT NULL REFERENCES invoice_items(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id), quantity integer NOT NULL CHECK(quantity > 0), condition text NOT NULL CHECK(condition IN ('RESELLABLE','DAMAGED','DISPOSED')), restock_location_id uuid REFERENCES locations(id), notes text
);
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_number text NOT NULL UNIQUE, return_id uuid REFERENCES returns(id), invoice_id uuid NOT NULL REFERENCES invoices(id),
  original_payment_id uuid REFERENCES payments(id), amount numeric(14,2) NOT NULL CHECK(amount > 0), method payment_method NOT NULL, status refund_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), paid_by uuid REFERENCES users(id), reason text NOT NULL, idempotency_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, paid_at timestamptz
);
CREATE INDEX refunds_invoice_idx ON refunds(invoice_id, created_at DESC);

CREATE TABLE stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), adjustment_number text NOT NULL UNIQUE, variant_id uuid NOT NULL REFERENCES product_variants(id), location_id uuid NOT NULL REFERENCES locations(id),
  requested_delta integer NOT NULL CHECK(requested_delta <> 0), reason text NOT NULL, status adjustment_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), inventory_movement_id uuid REFERENCES inventory_movements(id), created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, applied_at timestamptz
);
CREATE INDEX stock_adjustments_pending_idx ON stock_adjustments(status, created_at) WHERE status='PENDING_APPROVAL';

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), customer_id uuid REFERENCES customers(id), type text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('IN_APP','SMS','WHATSAPP','EMAIL')), payload jsonb NOT NULL DEFAULT '{}'::jsonb, status notification_status NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, read_at timestamptz, failure_reason text
);
CREATE INDEX notifications_pending_idx ON notifications(status, created_at) WHERE status='PENDING';
CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now());

-- No financial or inventory history is physically deleted. Corrections use the
-- explicit return, refund, void, receipt, and adjustment models above.
REVOKE ALL ON customer_prescriptions, orders, order_items, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items, returns, return_items, refunds, stock_adjustments, notifications, settings FROM anon, authenticated;
