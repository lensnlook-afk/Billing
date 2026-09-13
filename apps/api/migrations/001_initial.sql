CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The browser never connects to Supabase's Data API. Keep its default API roles
-- unable to read business data even if a public API key is exposed elsewhere.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), login_name text NOT NULL UNIQUE, display_name text NOT NULL,
  password_hash text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, is_system boolean NOT NULL DEFAULT true);
CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, description text NOT NULL);
CREATE TABLE user_roles (user_id uuid NOT NULL REFERENCES users(id), role_id uuid NOT NULL REFERENCES roles(id), PRIMARY KEY (user_id, role_id));
CREATE TABLE role_permissions (role_id uuid NOT NULL REFERENCES roles(id), permission_id uuid NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, ip inet, user_agent text, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE, name text NOT NULL,
  mobile text, email text, address text, date_of_birth date, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE UNIQUE INDEX customers_mobile_unique_active ON customers(mobile) WHERE mobile IS NOT NULL AND archived_at IS NULL;
CREATE INDEX customers_name_search_idx ON customers USING gin (to_tsvector('simple', name));
CREATE INDEX customers_mobile_idx ON customers(mobile);
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true);
CREATE TABLE brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, mobile text, email text, tax_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE locations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, active boolean NOT NULL DEFAULT true);
INSERT INTO locations(code, name) VALUES ('MAIN', 'Main stock room');

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category_id uuid REFERENCES categories(id), brand_id uuid REFERENCES brands(id), supplier_id uuid REFERENCES suppliers(id),
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), sku text NOT NULL UNIQUE, barcode text UNIQUE,
  model text, variant text, size text, color text, cost_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0), selling_price numeric(14,2) NOT NULL CHECK (selling_price >= 0), mrp numeric(14,2) CHECK (mrp IS NULL OR mrp >= 0), reorder_threshold integer NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX variants_sku_idx ON product_variants(sku); CREATE INDEX variants_barcode_idx ON product_variants(barcode);
CREATE TABLE inventory_balances (variant_id uuid NOT NULL REFERENCES product_variants(id), location_id uuid NOT NULL REFERENCES locations(id), quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (variant_id, location_id));
CREATE TYPE inventory_movement_type AS ENUM ('PURCHASE','SALE','RETURN','DAMAGE','ADJUSTMENT','TRANSFER','STOCK_RECEIPT','STOCK_RESERVATION','STOCK_RELEASE','OTHER');
CREATE TABLE inventory_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), variant_id uuid NOT NULL REFERENCES product_variants(id), location_id uuid NOT NULL REFERENCES locations(id), movement_type inventory_movement_type NOT NULL, quantity_delta integer NOT NULL CHECK (quantity_delta <> 0), quantity_before integer NOT NULL, quantity_after integer NOT NULL CHECK (quantity_after >= 0), reference_type text NOT NULL, reference_id uuid, reason text, performed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX movements_variant_created_idx ON inventory_movements(variant_id, created_at DESC);

CREATE TYPE invoice_status AS ENUM ('DRAFT','POSTED','VOIDED','REFUNDED'); CREATE TYPE payment_status AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','REFUNDED');
CREATE TABLE document_sequences (document_type text NOT NULL, year integer NOT NULL, last_value bigint NOT NULL DEFAULT 0, PRIMARY KEY(document_type, year));
CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL UNIQUE, customer_id uuid REFERENCES customers(id), status invoice_status NOT NULL DEFAULT 'POSTED', payment_status payment_status NOT NULL, subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0), discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0), tax_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0), grand_total numeric(14,2) NOT NULL CHECK (grand_total >= 0), amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK(amount_paid >= 0), amount_due numeric(14,2) NOT NULL CHECK(amount_due >= 0), cashier_id uuid NOT NULL REFERENCES users(id), idempotency_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX invoices_customer_idx ON invoices(customer_id, created_at DESC); CREATE INDEX invoices_status_idx ON invoices(payment_status, created_at DESC);
CREATE TABLE invoice_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id), variant_id uuid NOT NULL REFERENCES product_variants(id), sku_snapshot text NOT NULL, description_snapshot text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0), unit_price numeric(14,2) NOT NULL CHECK(unit_price >= 0), discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount >= 0), tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(tax_rate >= 0), line_total numeric(14,2) NOT NULL CHECK(line_total >= 0));
CREATE TYPE payment_method AS ENUM ('CASH','UPI','CARD','BANK_TRANSFER','OTHER');
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id), amount numeric(14,2) NOT NULL CHECK(amount > 0), method payment_method NOT NULL, reference text, received_by uuid NOT NULL REFERENCES users(id), idempotency_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE idempotency_keys (key text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), request_hash text NOT NULL, status_code integer, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);

CREATE TABLE audit_chain_heads (scope text PRIMARY KEY, last_hash text NOT NULL); INSERT INTO audit_chain_heads(scope,last_hash) VALUES ('global', repeat('0',64));
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE, actor_id uuid REFERENCES users(id), actor_login text, actor_roles text[] NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(), ip inet, session_id uuid, request_id text, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, previous_value jsonb, new_value jsonb, reason text, transaction_id uuid, canonical_payload text NOT NULL, previous_hash text NOT NULL, event_hash text NOT NULL UNIQUE);
CREATE INDEX audit_entity_idx ON audit_logs(entity_type, entity_id, occurred_at DESC); CREATE INDEX audit_occurred_idx ON audit_logs(occurred_at DESC);
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC;

INSERT INTO roles(code,name) VALUES ('OWNER','Owner / Admin'),('MANAGER','Manager'),('CASHIER','Employee / Cashier'),('INVENTORY','Inventory staff');
INSERT INTO permissions(code,description) VALUES
('dashboard.read','View operational dashboard'),('customers.read','Search customers'),('customers.write','Create and edit customers'),('products.read','View products'),('products.write','Manage products'),('inventory.read','View stock'),('inventory.adjust','Request or perform stock adjustments'),('invoices.create','Create posted invoices'),('invoices.read','View invoices'),('payments.create','Record permitted payments'),('audit.read','Read audit events'),('users.manage','Manage users and roles'),('settings.manage','Manage system settings');
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='OWNER';
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code = ANY(ARRAY['dashboard.read','customers.read','customers.write','products.read','products.write','inventory.read','invoices.create','invoices.read','payments.create']) WHERE r.code='MANAGER';
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code = ANY(ARRAY['dashboard.read','customers.read','customers.write','products.read','inventory.read','invoices.create','invoices.read','payments.create']) WHERE r.code='CASHIER';
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code = ANY(ARRAY['products.read','products.write','inventory.read','inventory.adjust']) WHERE r.code='INVENTORY';
