-- =============================================================================
-- LENS & LOOK — Production Multi-Store Optical Retail Schema
-- PostgreSQL 17 / Supabase
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- ENUM TYPES  (safe re-run)
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('SUPER_ADMIN','ADMIN','STORE_MANAGER','EMPLOYEE','INVENTORY_MANAGER','ACCOUNTANT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE product_type AS ENUM ('FRAME','LENS','CONTACT_LENS','ACCESSORY','SERVICE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE inventory_item_status AS ENUM ('AVAILABLE','RESERVED','SOLD','DAMAGED','LOST','RETURNED','TRANSFERRED','QUARANTINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE inventory_tx_type AS ENUM ('PURCHASE','SALE','RETURN','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','LOSS','FOUND','RESERVATION','RELEASE_RESERVATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_status AS ENUM ('DRAFT','REQUESTED','APPROVED','IN_TRANSIT','RECEIVED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_order_status AS ENUM ('DRAFT','BOOKED','CONFIRMED','PROCESSING','READY_FOR_DELIVERY','DELIVERED','CANCELLED','RETURNED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_payment_status AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','REFUNDED','PARTIALLY_REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_fulfillment_status AS ENUM ('NOT_STARTED','PROCESSING','READY','DELIVERED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_payment_method AS ENUM ('CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_payment_type AS ENUM ('ADVANCE','FULL_PAYMENT','DELIVERY_PAYMENT','BALANCE_PAYMENT','REFUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_payment_record_status AS ENUM ('PENDING','SUCCESS','FAILED','REFUNDED','VOIDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE discount_type AS ENUM ('PERCENTAGE','FIXED_AMOUNT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ol_return_status AS ENUM ('REQUESTED','APPROVED','REJECTED','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_condition AS ENUM ('GOOD','DAMAGED','DEFECTIVE','USED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE stock_count_status AS ENUM ('DRAFT','IN_PROGRESS','PENDING_APPROVAL','APPROVED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gender_type AS ENUM ('MALE','FEMALE','UNISEX','KIDS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- CORE TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  legal_name   text,
  phone        text,
  email        text,
  address      text,
  city         text,
  state        text,
  pincode      text,
  gst_number   text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_code      text        NOT NULL,
  store_name      text        NOT NULL,
  phone           text,
  email           text,
  address         text,
  city            text,
  state           text,
  pincode         text,
  gst_number      text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_code)
);

CREATE TABLE IF NOT EXISTS profiles (
  id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  full_name         text        NOT NULL,
  phone             text,
  email             text,
  employee_code     text,
  role              user_role   NOT NULL DEFAULT 'EMPLOYEE',
  designation       text,
  assigned_store_id uuid        REFERENCES stores(id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  joining_date      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_code)
);

CREATE TABLE IF NOT EXISTS settings (
  organization_id                      uuid         PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  max_employee_discount_pct            numeric(5,2) NOT NULL DEFAULT 10   CHECK (max_employee_discount_pct >= 0),
  approval_required_above_amount       numeric(14,2) NOT NULL DEFAULT 500  CHECK (approval_required_above_amount >= 0),
  low_stock_threshold                  integer      NOT NULL DEFAULT 5     CHECK (low_stock_threshold >= 0),
  allow_negative_inventory             boolean      NOT NULL DEFAULT false,
  require_payment_ref_for_upi          boolean      NOT NULL DEFAULT true,
  require_manager_approval_for_refunds boolean      NOT NULL DEFAULT true,
  updated_at                           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_sequences (
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prefix          text    NOT NULL,
  year            integer NOT NULL,
  last_value      bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, prefix, year)
);

CREATE TABLE IF NOT EXISTS brands (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            text    NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            text         NOT NULL,
  product_type    product_type NOT NULL,
  is_active       boolean      NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS products (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  sku             text         NOT NULL,
  barcode         text,
  product_type    product_type NOT NULL,
  brand_id        uuid         REFERENCES brands(id) ON DELETE SET NULL,
  category_id     uuid         REFERENCES categories(id) ON DELETE SET NULL,
  product_name    text         NOT NULL,
  description     text,
  model_number    text,
  color           text,
  size            text,
  gender          gender_type,
  material        text,
  selling_price   numeric(14,2) NOT NULL CHECK (selling_price >= 0),
  cost_price      numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  reorder_level   integer       NOT NULL DEFAULT 5  CHECK (reorder_level >= 0),
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

CREATE TABLE IF NOT EXISTS price_history (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  old_cost_price    numeric(14,2) NOT NULL CHECK (old_cost_price    >= 0),
  new_cost_price    numeric(14,2) NOT NULL CHECK (new_cost_price    >= 0),
  old_selling_price numeric(14,2) NOT NULL CHECK (old_selling_price >= 0),
  new_selling_price numeric(14,2) NOT NULL CHECK (new_selling_price >= 0),
  changed_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frame_details (
  product_id             uuid        PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  frame_type             text,
  shape                  text,
  material               text,
  color                  text,
  bridge_size            numeric(6,2),
  temple_size            numeric(6,2),
  eye_size               numeric(6,2),
  prescription_supported boolean     NOT NULL DEFAULT true,
  warranty_months        integer     CHECK (warranty_months >= 0),
  gender                 gender_type,
  notes                  text
);

CREATE TABLE IF NOT EXISTS lens_details (
  product_id      uuid        PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  lens_type       text,
  lens_material   text,
  index_value     numeric(4,2),
  coating         text,
  tint            text,
  photochromic    boolean     NOT NULL DEFAULT false,
  blue_cut        boolean     NOT NULL DEFAULT false,
  uv_protection   boolean     NOT NULL DEFAULT true,
  progressive     boolean     NOT NULL DEFAULT false,
  manufacturer    text,
  warranty_months integer     CHECK (warranty_months >= 0),
  notes           text
);

CREATE TABLE IF NOT EXISTS customers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_code   text        NOT NULL,
  full_name       text        NOT NULL,
  phone           text        NOT NULL,
  alternate_phone text,
  email           text,
  date_of_birth   date,
  gender          gender_type,
  address         text,
  city            text,
  state           text,
  pincode         text,
  notes           text,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid        REFERENCES profiles(id),
  UNIQUE (organization_id, customer_code)
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  doctor_name       text,
  prescription_date date        NOT NULL DEFAULT CURRENT_DATE,
  expiry_date       date,
  right_sphere      numeric(5,2),
  right_cylinder    numeric(5,2),
  right_axis        integer     CHECK (right_axis BETWEEN 0 AND 180),
  right_add         numeric(5,2),
  right_pd          numeric(5,2),
  left_sphere       numeric(5,2),
  left_cylinder     numeric(5,2),
  left_axis         integer     CHECK (left_axis BETWEEN 0 AND 180),
  left_add          numeric(5,2),
  left_pd           numeric(5,2),
  binocular_pd      numeric(5,2),
  notes             text,
  created_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_inventory (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid        NOT NULL REFERENCES stores(id)   ON DELETE RESTRICT,
  product_id        uuid        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity          integer     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity integer     NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  damaged_quantity  integer     NOT NULL DEFAULT 0 CHECK (damaged_quantity  >= 0),
  reorder_level     integer     NOT NULL DEFAULT 5 CHECK (reorder_level     >= 0),
  last_stock_count  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id),
  CONSTRAINT chk_reserved_lte_qty CHECK (reserved_quantity <= quantity)
);

ALTER TABLE store_inventory
  ADD COLUMN IF NOT EXISTS available_quantity integer
  GENERATED ALWAYS AS (quantity - reserved_quantity) STORED;

CREATE TABLE IF NOT EXISTS inventory_items (
  id             uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid                  NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  store_id       uuid                  NOT NULL REFERENCES stores(id)   ON DELETE RESTRICT,
  barcode        text,
  serial_number  text,
  batch_number   text,
  purchase_price numeric(14,2)         NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price  numeric(14,2)         NOT NULL CHECK (selling_price >= 0),
  status         inventory_item_status NOT NULL DEFAULT 'AVAILABLE',
  received_at    timestamptz           NOT NULL DEFAULT now(),
  sold_at        timestamptz,
  created_at     timestamptz           NOT NULL DEFAULT now(),
  updated_at     timestamptz           NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid              NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id          uuid              NOT NULL REFERENCES stores(id)         ON DELETE RESTRICT,
  product_id        uuid              NOT NULL REFERENCES products(id)       ON DELETE RESTRICT,
  inventory_item_id uuid              REFERENCES inventory_items(id)        ON DELETE RESTRICT,
  transaction_type  inventory_tx_type NOT NULL,
  quantity          integer           NOT NULL CHECK (quantity <> 0),
  previous_quantity integer           NOT NULL CHECK (previous_quantity >= 0),
  new_quantity      integer           NOT NULL CHECK (new_quantity      >= 0),
  reference_type    text              NOT NULL,
  reference_id      uuid,
  reason            text,
  performed_by      uuid              REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by       uuid              REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz       NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE, TRUNCATE ON inventory_transactions FROM PUBLIC;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id                   uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid            NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_store_id      uuid            NOT NULL REFERENCES stores(id)        ON DELETE RESTRICT,
  destination_store_id uuid            NOT NULL REFERENCES stores(id)        ON DELETE RESTRICT,
  transfer_number      text            NOT NULL,
  status               transfer_status NOT NULL DEFAULT 'DRAFT',
  requested_by         uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by          uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_at           timestamptz,
  received_at          timestamptz,
  notes                text,
  created_at           timestamptz     NOT NULL DEFAULT now(),
  updated_at           timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transfer_number),
  CONSTRAINT chk_diff_stores CHECK (source_store_id <> destination_store_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id       uuid    NOT NULL REFERENCES stock_transfers(id) ON DELETE RESTRICT,
  product_id        uuid    NOT NULL REFERENCES products(id)        ON DELETE RESTRICT,
  inventory_item_id uuid    REFERENCES inventory_items(id)         ON DELETE RESTRICT,
  quantity          integer NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id             uuid               NOT NULL REFERENCES stores(id)        ON DELETE RESTRICT,
  order_number         text               NOT NULL,
  customer_id          uuid               REFERENCES customers(id) ON DELETE RESTRICT,
  created_by           uuid               REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_employee_id uuid               REFERENCES profiles(id) ON DELETE SET NULL,
  order_status         ol_order_status    NOT NULL DEFAULT 'DRAFT',
  payment_status       ol_payment_status  NOT NULL DEFAULT 'UNPAID',
  fulfillment_status   ol_fulfillment_status NOT NULL DEFAULT 'NOT_STARTED',
  subtotal             numeric(14,2)      NOT NULL DEFAULT 0 CHECK (subtotal        >= 0),
  discount_amount      numeric(14,2)      NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount           numeric(14,2)      NOT NULL DEFAULT 0 CHECK (tax_amount      >= 0),
  total_amount         numeric(14,2)      NOT NULL DEFAULT 0 CHECK (total_amount    >= 0),
  advance_amount       numeric(14,2)      NOT NULL DEFAULT 0 CHECK (advance_amount  >= 0),
  expected_delivery_date date,
  actual_delivery_date   date,
  notes                text,
  created_at           timestamptz        NOT NULL DEFAULT now(),
  updated_at           timestamptz        NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by           uuid               REFERENCES profiles(id),
  UNIQUE (organization_id, order_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid         NOT NULL REFERENCES orders(id)   ON DELETE RESTRICT,
  product_id          uuid         REFERENCES products(id)          ON DELETE RESTRICT,
  inventory_item_id   uuid         REFERENCES inventory_items(id)   ON DELETE RESTRICT,
  item_type           product_type NOT NULL,
  description         text         NOT NULL,
  quantity            integer      NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(14,2) NOT NULL CHECK (unit_price      >= 0),
  discount_amount     numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate            numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate        >= 0),
  tax_amount          numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount      >= 0),
  line_total          numeric(14,2) NOT NULL CHECK (line_total       >= 0),
  cost_price_snapshot numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price_snapshot >= 0),
  prescription_id     uuid         REFERENCES prescriptions(id) ON DELETE SET NULL,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discounts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id        uuid          NOT NULL REFERENCES orders(id)        ON DELETE RESTRICT,
  order_item_id   uuid          REFERENCES order_items(id)           ON DELETE RESTRICT,
  discount_type   discount_type NOT NULL,
  discount_value  numeric(14,2) NOT NULL CHECK (discount_value >= 0),
  reason          text          NOT NULL,
  created_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id                    uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid                   NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id              uuid                   NOT NULL REFERENCES stores(id)        ON DELETE RESTRICT,
  order_id              uuid                   NOT NULL REFERENCES orders(id)        ON DELETE RESTRICT,
  customer_id           uuid                   REFERENCES customers(id)             ON DELETE RESTRICT,
  payment_number        text                   NOT NULL,
  amount                numeric(14,2)          NOT NULL CHECK (amount > 0),
  payment_type          ol_payment_type        NOT NULL,
  payment_method        ol_payment_method      NOT NULL,
  transaction_reference text,
  payment_status        ol_payment_record_status NOT NULL DEFAULT 'PENDING',
  received_by           uuid                   REFERENCES profiles(id) ON DELETE SET NULL,
  payment_date          timestamptz            NOT NULL DEFAULT now(),
  notes                 text,
  created_at            timestamptz            NOT NULL DEFAULT now(),
  UNIQUE (organization_id, payment_number)
);
REVOKE UPDATE, DELETE, TRUNCATE ON payments FROM PUBLIC;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid        NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id   uuid        NOT NULL REFERENCES orders(id)   ON DELETE RESTRICT,
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, order_id)
);

CREATE TABLE IF NOT EXISTS returns (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid             NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id        uuid             NOT NULL REFERENCES stores(id)        ON DELETE RESTRICT,
  order_id        uuid             NOT NULL REFERENCES orders(id)        ON DELETE RESTRICT,
  return_number   text             NOT NULL,
  customer_id     uuid             REFERENCES customers(id) ON DELETE RESTRICT,
  reason          text             NOT NULL,
  status          ol_return_status NOT NULL DEFAULT 'REQUESTED',
  requested_by    uuid             REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     uuid             REFERENCES profiles(id) ON DELETE SET NULL,
  refund_amount   numeric(14,2)    NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (organization_id, return_number)
);

CREATE TABLE IF NOT EXISTS return_items (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     uuid           NOT NULL REFERENCES returns(id)     ON DELETE RESTRICT,
  order_item_id uuid           NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  product_id    uuid           NOT NULL REFERENCES products(id)    ON DELETE RESTRICT,
  quantity      integer        NOT NULL CHECK (quantity > 0),
  condition     item_condition NOT NULL,
  restockable   boolean        NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid               NOT NULL REFERENCES stores(id)   ON DELETE RESTRICT,
  initiated_by uuid               REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by  uuid               REFERENCES profiles(id) ON DELETE SET NULL,
  status       stock_count_status NOT NULL DEFAULT 'DRAFT',
  count_date   date               NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  created_at   timestamptz        NOT NULL DEFAULT now(),
  updated_at   timestamptz        NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id    uuid    NOT NULL REFERENCES stock_counts(id) ON DELETE RESTRICT,
  product_id        uuid    NOT NULL REFERENCES products(id)     ON DELETE RESTRICT,
  system_quantity   integer NOT NULL CHECK (system_quantity  >= 0),
  physical_quantity integer NOT NULL CHECK (physical_quantity >= 0),
  difference        integer GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
  reason            text
);

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  type            text        NOT NULL,
  title           text        NOT NULL,
  message         text        NOT NULL,
  reference_type  text,
  reference_id    uuid,
  is_read         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  store_id        uuid        REFERENCES stores(id)   ON DELETE SET NULL,
  action          text        NOT NULL,
  entity_type     text        NOT NULL,
  entity_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stores_org               ON stores (organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org             ON profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_store           ON profiles (assigned_store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role            ON profiles (organization_id, role);
CREATE INDEX IF NOT EXISTS idx_brands_org               ON brands (organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org           ON categories (organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org             ON products (organization_id);
CREATE INDEX IF NOT EXISTS idx_products_type            ON products (organization_id, product_type);
CREATE INDEX IF NOT EXISTS idx_products_brand           ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode         ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm       ON products USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm        ON products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_price_hist_product       ON price_history (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_org            ON customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone          ON customers (organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm      ON customers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer   ON prescriptions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_si_store_product         ON store_inventory (store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_si_low_stock             ON store_inventory (store_id, available_quantity);
CREATE INDEX IF NOT EXISTS idx_inv_items_store_product  ON inventory_items (store_id, product_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_items_barcode        ON inventory_items (barcode);
CREATE INDEX IF NOT EXISTS idx_inv_tx_store             ON inventory_transactions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product           ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_org               ON inventory_transactions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref               ON inventory_transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_transfers_org            ON stock_transfers (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_source         ON stock_transfers (source_store_id);
CREATE INDEX IF NOT EXISTS idx_transfers_dest           ON stock_transfers (destination_store_id);
CREATE INDEX IF NOT EXISTS idx_orders_org               ON orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store             ON orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer          ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_employee          ON orders (assigned_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON orders (order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order        ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product      ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_discounts_order          ON discounts (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order           ON payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer        ON payments (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_store           ON payments (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_org_method      ON payments (organization_id, payment_method, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ref             ON payments (transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_returns_order            ON returns (order_id);
CREATE INDEX IF NOT EXISTS idx_audit_org                ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user               ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity             ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action             ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user       ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org        ON notifications (organization_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- TRIGGERS & TRIGGER FUNCTIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'organizations','stores','profiles','products','store_inventory',
    'inventory_items','orders','stock_transfers','returns',
    'stock_counts','settings','customers'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;
       CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- Block direct quantity edits on store_inventory
CREATE OR REPLACE FUNCTION deny_direct_inv_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.quantity <> NEW.quantity OR
      OLD.reserved_quantity <> NEW.reserved_quantity OR
      OLD.damaged_quantity  <> NEW.damaged_quantity)
  AND current_setting('app.allow_inventory_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'Direct inventory quantity changes are not permitted. Use the inventory functions.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_direct_inv ON store_inventory;
CREATE TRIGGER trg_deny_direct_inv
  BEFORE UPDATE ON store_inventory
  FOR EACH ROW EXECUTE FUNCTION deny_direct_inv_update();

-- Audit price changes
CREATE OR REPLACE FUNCTION trg_audit_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.selling_price <> NEW.selling_price OR OLD.cost_price <> NEW.cost_price THEN
    INSERT INTO price_history (
      product_id, old_cost_price, new_cost_price,
      old_selling_price, new_selling_price, changed_by
    ) VALUES (
      NEW.id, OLD.cost_price, NEW.cost_price,
      OLD.selling_price, NEW.selling_price, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_change ON products;
CREATE TRIGGER trg_price_change
  AFTER UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trg_audit_price_change();

-- Block modification of successful payments
CREATE OR REPLACE FUNCTION deny_payment_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_status = 'SUCCESS' THEN
    RAISE EXCEPTION 'Cannot modify a successful payment. Use a reversal or refund instead.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_payment_mod ON payments;
CREATE TRIGGER trg_deny_payment_mod
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION deny_payment_modification();


-- ---------------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------------

-- Safe document number generator
CREATE OR REPLACE FUNCTION next_sequence(
  p_org_id uuid,
  p_prefix text,
  p_year   int DEFAULT date_part('year', now())::int
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_seq bigint; BEGIN
  INSERT INTO document_sequences (organization_id, prefix, year, last_value)
  VALUES (p_org_id, p_prefix, p_year, 0)
  ON CONFLICT (organization_id, prefix, year) DO NOTHING;

  UPDATE document_sequences
  SET    last_value = last_value + 1
  WHERE  organization_id = p_org_id AND prefix = p_prefix AND year = p_year
  RETURNING last_value INTO v_seq;

  RETURN p_prefix || '-' || p_year || '-' || lpad(v_seq::text, 6, '0');
END; $$;

-- Current user's org
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Adjust inventory atomically
CREATE OR REPLACE FUNCTION adjust_inventory(
  p_store_id       uuid,
  p_product_id     uuid,
  p_delta          integer,
  p_tx_type        inventory_tx_type,
  p_reference_type text,
  p_reference_id   uuid,
  p_reason         text,
  p_item_id        uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prev   integer;
  v_new    integer;
  v_allow  boolean;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM stores WHERE id = p_store_id;
  SELECT allow_negative_inventory INTO v_allow FROM settings WHERE organization_id = v_org_id;

  SELECT quantity INTO v_prev
  FROM   store_inventory
  WHERE  store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO store_inventory (store_id, product_id, quantity)
    VALUES (p_store_id, p_product_id, 0);
    v_prev := 0;
  END IF;

  v_new := v_prev + p_delta;

  IF v_new < 0 AND NOT COALESCE(v_allow, false) THEN
    RAISE EXCEPTION 'Insufficient stock: product % in store %', p_product_id, p_store_id;
  END IF;

  SET LOCAL app.allow_inventory_update = 'true';
  UPDATE store_inventory SET quantity = GREATEST(v_new, 0)
  WHERE  store_id = p_store_id AND product_id = p_product_id;

  INSERT INTO inventory_transactions (
    organization_id, store_id, product_id, inventory_item_id,
    transaction_type, quantity, previous_quantity, new_quantity,
    reference_type, reference_id, reason, performed_by
  ) VALUES (
    v_org_id, p_store_id, p_product_id, p_item_id,
    p_tx_type, p_delta, v_prev, GREATEST(v_new, 0),
    p_reference_type, p_reference_id, p_reason, auth.uid()
  );
END; $$;

-- Reserve inventory for an order
CREATE OR REPLACE FUNCTION reserve_inventory(
  p_store_id   uuid,
  p_product_id uuid,
  p_quantity   integer,
  p_order_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_avail integer; v_org_id uuid; BEGIN
  SELECT organization_id INTO v_org_id FROM stores WHERE id = p_store_id;
  SELECT available_quantity INTO v_avail
  FROM   store_inventory
  WHERE  store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  IF COALESCE(v_avail, 0) < p_quantity THEN
    RAISE EXCEPTION 'Cannot reserve %. Available: %', p_quantity, COALESCE(v_avail, 0);
  END IF;

  SET LOCAL app.allow_inventory_update = 'true';
  UPDATE store_inventory
  SET    reserved_quantity = reserved_quantity + p_quantity
  WHERE  store_id = p_store_id AND product_id = p_product_id;

  INSERT INTO inventory_transactions (
    organization_id, store_id, product_id, transaction_type,
    quantity, previous_quantity, new_quantity, reference_type, reference_id, performed_by
  ) SELECT v_org_id, p_store_id, p_product_id, 'RESERVATION',
           p_quantity, quantity, quantity, 'ORDER', p_order_id, auth.uid()
  FROM stores WHERE id = p_store_id;
END; $$;

-- Release reservation
CREATE OR REPLACE FUNCTION release_inventory(
  p_store_id   uuid,
  p_product_id uuid,
  p_quantity   integer,
  p_order_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; BEGIN
  SELECT organization_id INTO v_org_id FROM stores WHERE id = p_store_id;
  SET LOCAL app.allow_inventory_update = 'true';
  UPDATE store_inventory
  SET    reserved_quantity = GREATEST(reserved_quantity - p_quantity, 0)
  WHERE  store_id = p_store_id AND product_id = p_product_id;

  INSERT INTO inventory_transactions (
    organization_id, store_id, product_id, transaction_type,
    quantity, previous_quantity, new_quantity, reference_type, reference_id, performed_by
  ) SELECT v_org_id, p_store_id, p_product_id, 'RELEASE_RESERVATION',
           -p_quantity, quantity, quantity, 'ORDER', p_order_id, auth.uid()
  FROM stores WHERE id = p_store_id;
END; $$;

-- Calculate order balance from ledger (never from stored fields)
CREATE OR REPLACE FUNCTION calculate_order_balance(p_order_id uuid)
RETURNS TABLE (
  total_amount   numeric,
  total_paid     numeric,
  advance_paid   numeric,
  delivery_paid  numeric,
  total_refunded numeric,
  outstanding    numeric
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    o.total_amount,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type<>'REFUND'),0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='ADVANCE'),0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type IN ('DELIVERY_PAYMENT','BALANCE_PAYMENT')),0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='REFUND'),0),
    o.total_amount
      - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type<>'REFUND'),0)
      + COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='REFUND'),0)
  FROM  orders o
  LEFT  JOIN payments p ON p.order_id = o.id
  WHERE o.id = p_order_id
  GROUP BY o.id, o.total_amount;
$$;

-- Create order
CREATE OR REPLACE FUNCTION create_order(
  p_store_id             uuid,
  p_customer_id          uuid    DEFAULT NULL,
  p_expected_delivery    date    DEFAULT NULL,
  p_notes                text    DEFAULT NULL,
  p_assigned_employee_id uuid    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_num text; v_org uuid; BEGIN
  SELECT organization_id INTO v_org FROM stores WHERE id = p_store_id;
  v_num := next_sequence(v_org, 'ORD');
  INSERT INTO orders (organization_id, store_id, order_number, customer_id, created_by,
    assigned_employee_id, expected_delivery_date, notes)
  VALUES (v_org, p_store_id, v_num, p_customer_id, auth.uid(),
    COALESCE(p_assigned_employee_id, auth.uid()), p_expected_delivery, p_notes)
  RETURNING id INTO v_id;
  INSERT INTO audit_logs (organization_id, user_id, store_id, action, entity_type, entity_id)
  VALUES (v_org, auth.uid(), p_store_id, 'CREATE_ORDER', 'order', v_id);
  RETURN v_id;
END; $$;

-- Create payment
CREATE OR REPLACE FUNCTION create_payment(
  p_order_id  uuid,
  p_amount    numeric,
  p_type      ol_payment_type,
  p_method    ol_payment_method,
  p_reference text DEFAULT NULL,
  p_notes     text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order   orders;
  v_bal     record;
  v_pid     uuid;
  v_num     text;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.order_status IN ('CANCELLED','RETURNED') THEN
    RAISE EXCEPTION 'Cannot add payment to a % order', v_order.order_status;
  END IF;

  SELECT * INTO v_bal FROM calculate_order_balance(p_order_id);
  IF p_type <> 'REFUND' AND p_amount > v_bal.outstanding + 0.01 THEN
    RAISE EXCEPTION 'Payment % exceeds outstanding balance %', p_amount, v_bal.outstanding;
  END IF;

  v_num := next_sequence(v_order.organization_id, 'PAY');
  INSERT INTO payments (organization_id, store_id, order_id, customer_id,
    payment_number, amount, payment_type, payment_method,
    transaction_reference, payment_status, received_by, notes)
  VALUES (v_order.organization_id, v_order.store_id, p_order_id, v_order.customer_id,
    v_num, p_amount, p_type, p_method, p_reference, 'SUCCESS', auth.uid(), p_notes)
  RETURNING id INTO v_pid;

  SELECT * INTO v_bal FROM calculate_order_balance(p_order_id);
  UPDATE orders SET payment_status =
    CASE WHEN v_bal.outstanding <= 0 THEN 'PAID'::ol_payment_status
         WHEN v_bal.total_paid   >  0 THEN 'PARTIALLY_PAID'::ol_payment_status
         ELSE 'UNPAID'::ol_payment_status END
  WHERE id = p_order_id;

  INSERT INTO audit_logs (organization_id, user_id, store_id, action, entity_type, entity_id, new_data)
  VALUES (v_order.organization_id, auth.uid(), v_order.store_id, 'CREATE_PAYMENT', 'payment', v_pid,
    jsonb_build_object('amount', p_amount, 'type', p_type, 'method', p_method));
  RETURN v_pid;
END; $$;

-- Complete delivery
CREATE OR REPLACE FUNCTION complete_delivery(
  p_order_id      uuid,
  p_payment_amount numeric        DEFAULT 0,
  p_method        ol_payment_method DEFAULT 'CASH',
  p_reference     text           DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order orders; v_bal record; BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.order_status NOT IN ('READY_FOR_DELIVERY','CONFIRMED','PROCESSING') THEN
    RAISE EXCEPTION 'Order not ready for delivery (status: %)', v_order.order_status;
  END IF;
  IF p_payment_amount > 0 THEN
    PERFORM create_payment(p_order_id, p_payment_amount, 'DELIVERY_PAYMENT', p_method, p_reference);
  END IF;
  SELECT * INTO v_bal FROM calculate_order_balance(p_order_id);
  IF v_bal.outstanding > 0.01 THEN
    RAISE EXCEPTION 'Outstanding balance ₹% must be cleared before delivery', v_bal.outstanding;
  END IF;
  UPDATE orders SET order_status='DELIVERED', fulfillment_status='DELIVERED',
    actual_delivery_date=CURRENT_DATE WHERE id = p_order_id;
  INSERT INTO audit_logs (organization_id, user_id, store_id, action, entity_type, entity_id)
  VALUES (v_order.organization_id, auth.uid(), v_order.store_id, 'ORDER_DELIVERED', 'order', p_order_id);
END; $$;

-- Create stock transfer
CREATE OR REPLACE FUNCTION create_stock_transfer(
  p_source_store_id uuid,
  p_dest_store_id   uuid,
  p_items           jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_num text; v_org uuid; v_item jsonb; BEGIN
  SELECT organization_id INTO v_org FROM stores WHERE id = p_source_store_id;
  v_num := next_sequence(v_org, 'TRF');
  INSERT INTO stock_transfers (organization_id, source_store_id, destination_store_id,
    transfer_number, requested_by)
  VALUES (v_org, p_source_store_id, p_dest_store_id, v_num, auth.uid())
  RETURNING id INTO v_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO stock_transfer_items (transfer_id, product_id, inventory_item_id, quantity)
    VALUES (v_id, (v_item->>'product_id')::uuid,
            (v_item->>'inventory_item_id')::uuid,
            (v_item->>'quantity')::integer);
  END LOOP;
  RETURN v_id;
END; $$;

-- Receive stock transfer
CREATE OR REPLACE FUNCTION receive_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t stock_transfers; v_i stock_transfer_items; BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t.status <> 'IN_TRANSIT' THEN
    RAISE EXCEPTION 'Transfer not IN_TRANSIT (status: %)', v_t.status;
  END IF;
  FOR v_i IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM adjust_inventory(v_t.source_store_id, v_i.product_id,
      -v_i.quantity, 'TRANSFER_OUT', 'STOCK_TRANSFER', p_transfer_id,
      'Transfer out', v_i.inventory_item_id);
    PERFORM adjust_inventory(v_t.destination_store_id, v_i.product_id,
       v_i.quantity, 'TRANSFER_IN',  'STOCK_TRANSFER', p_transfer_id,
      'Transfer in', v_i.inventory_item_id);
  END LOOP;
  UPDATE stock_transfers SET status='RECEIVED', received_at=now() WHERE id=p_transfer_id;
  INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id)
  VALUES (v_t.organization_id, auth.uid(), 'STOCK_TRANSFER', 'stock_transfer', p_transfer_id);
END; $$;

-- Employee sales summary
CREATE OR REPLACE FUNCTION calculate_employee_sales(
  p_employee_id uuid,
  p_from timestamptz,
  p_to   timestamptz
) RETURNS TABLE (
  employee_id         uuid, employee_name text, store_name text,
  total_orders        bigint, total_sales numeric, total_collected numeric,
  total_advance       numeric, total_delivery numeric,
  total_discount      numeric, total_refunds numeric, average_order_value numeric
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id, p.full_name, s.store_name,
    COUNT(DISTINCT o.id),
    COALESCE(SUM(o.total_amount),0),
    COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type<>'REFUND'),0),
    COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type='ADVANCE'),0),
    COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type IN ('DELIVERY_PAYMENT','BALANCE_PAYMENT')),0),
    COALESCE(SUM(o.discount_amount),0),
    COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type='REFUND'),0),
    CASE WHEN COUNT(DISTINCT o.id)=0 THEN 0
         ELSE ROUND(SUM(o.total_amount)/COUNT(DISTINCT o.id),2) END
  FROM profiles p
  LEFT JOIN stores s   ON s.id = p.assigned_store_id
  LEFT JOIN orders o   ON o.assigned_employee_id = p.id
                      AND o.created_at BETWEEN p_from AND p_to
                      AND o.deleted_at IS NULL
  LEFT JOIN payments pay ON pay.order_id = o.id
  WHERE p.id = p_employee_id
  GROUP BY p.id, p.full_name, s.store_name;
$$;

-- Low stock
CREATE OR REPLACE FUNCTION get_low_stock(p_org_id uuid)
RETURNS TABLE (store_id uuid, store_name text, product_id uuid,
               product_name text, sku text, available_qty integer, reorder_level integer)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT si.store_id, st.store_name, p.id, p.product_name, p.sku,
         si.available_quantity, si.reorder_level
  FROM   store_inventory si
  JOIN   stores   st ON st.id = si.store_id
  JOIN   products p  ON p.id  = si.product_id
  WHERE  st.organization_id = p_org_id
    AND  si.available_quantity <= si.reorder_level
  ORDER  BY si.available_quantity;
$$;

-- Customer outstanding
CREATE OR REPLACE FUNCTION get_customer_balance(p_customer_id uuid)
RETURNS TABLE (order_id uuid, order_number text, total_amount numeric,
               total_paid numeric, outstanding numeric)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT o.id, o.order_number, b.total_amount, b.total_paid, b.outstanding
  FROM   orders o
  CROSS  JOIN LATERAL calculate_order_balance(o.id) b
  WHERE  o.customer_id = p_customer_id AND o.deleted_at IS NULL AND b.outstanding > 0;
$$;


-- ---------------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_store_inventory AS
SELECT si.*, s.store_name, s.organization_id, p.product_name, p.sku,
       p.product_type, p.selling_price, p.cost_price
FROM   store_inventory si
JOIN   stores   s ON s.id = si.store_id
JOIN   products p ON p.id = si.product_id;

CREATE OR REPLACE VIEW v_low_stock AS
SELECT * FROM v_store_inventory WHERE available_quantity <= reorder_level;

CREATE OR REPLACE VIEW v_product_stock AS
SELECT p.id, p.organization_id, p.product_name, p.sku, p.product_type,
       COALESCE(SUM(si.quantity),0)::int           total_quantity,
       COALESCE(SUM(si.available_quantity),0)::int total_available,
       COALESCE(SUM(si.reserved_quantity),0)::int  total_reserved,
       COALESCE(SUM(si.damaged_quantity),0)::int   total_damaged
FROM   products p
LEFT   JOIN store_inventory si ON si.product_id = p.id
GROUP  BY p.id;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT o.organization_id, o.store_id, st.store_name,
       date_trunc('day', o.created_at)::date sale_date,
       COUNT(*)::bigint                       order_count,
       SUM(o.total_amount)                   gross_sales,
       SUM(o.discount_amount)                total_discounts,
       SUM(o.tax_amount)                     total_tax,
       SUM(o.total_amount - o.discount_amount) net_sales
FROM   orders o
JOIN   stores st ON st.id = o.store_id
WHERE  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY o.organization_id, o.store_id, st.store_name, sale_date;

CREATE OR REPLACE VIEW v_monthly_sales AS
SELECT o.organization_id, o.store_id, st.store_name,
       date_trunc('month', o.created_at)::date AS sale_month,
       COUNT(*)::bigint order_count,
       SUM(o.total_amount) gross_sales,
       SUM(o.discount_amount) total_discounts,
       SUM(o.total_amount - o.discount_amount) net_sales
FROM   orders o
JOIN   stores st ON st.id = o.store_id
WHERE  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY o.organization_id, o.store_id, st.store_name, sale_month;

CREATE OR REPLACE VIEW v_payment_summary AS
SELECT p.organization_id, p.store_id, st.store_name,
       date_trunc('day', p.created_at)::date pay_date,
       p.payment_method,
       COUNT(*)::bigint payment_count,
       SUM(p.amount) FILTER (WHERE p.payment_type <> 'REFUND') total_collected,
       SUM(p.amount) FILTER (WHERE p.payment_type = 'REFUND')  total_refunded
FROM   payments p
JOIN   stores st ON st.id = p.store_id
WHERE  p.payment_status = 'SUCCESS'
GROUP  BY p.organization_id, p.store_id, st.store_name, pay_date, p.payment_method;

CREATE OR REPLACE VIEW v_employee_sales AS
SELECT pr.id employee_id, pr.full_name, pr.organization_id,
       s.store_name, o.store_id,
       date_trunc('day', o.created_at)::date sale_date,
       COUNT(o.id)::bigint total_orders,
       COALESCE(SUM(o.total_amount),0) total_sales,
       COALESCE(SUM(o.discount_amount),0) total_discounts
FROM   profiles pr
JOIN   stores s ON s.id = pr.assigned_store_id
LEFT   JOIN orders o ON o.assigned_employee_id = pr.id
  AND  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY pr.id, pr.full_name, pr.organization_id, s.store_name, o.store_id, sale_date;

CREATE OR REPLACE VIEW v_customer_outstanding AS
SELECT c.id customer_id, c.full_name, c.phone, c.organization_id,
       o.id order_id, o.order_number, o.store_id, st.store_name,
       o.total_amount,
       COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type<>'REFUND'),0) paid,
       COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='REFUND'),0) refunded,
       o.total_amount
         - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type<>'REFUND'),0)
         + COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='REFUND'),0)
         AS outstanding
FROM   orders o
JOIN   customers c  ON c.id  = o.customer_id
JOIN   stores    st ON st.id = o.store_id
LEFT   JOIN payments p ON p.order_id = o.id
WHERE  o.order_status <> 'CANCELLED' AND o.deleted_at IS NULL
GROUP  BY c.id, c.full_name, c.phone, c.organization_id,
          o.id, o.order_number, o.store_id, st.store_name, o.total_amount
HAVING o.total_amount
       - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type<>'REFUND'),0)
       + COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status='SUCCESS' AND p.payment_type='REFUND'),0)
       > 0;

CREATE OR REPLACE VIEW v_pending_deliveries AS
SELECT o.id, o.order_number, o.organization_id, o.store_id, st.store_name,
       c.full_name customer_name, c.phone, o.total_amount,
       o.expected_delivery_date
FROM   orders o
JOIN   stores    st ON st.id = o.store_id
LEFT   JOIN customers c ON c.id = o.customer_id
WHERE  o.order_status IN ('CONFIRMED','PROCESSING','READY_FOR_DELIVERY')
  AND  o.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_inventory_movements AS
SELECT it.*, p.product_name, p.sku, st.store_name, pr.full_name performed_by_name
FROM   inventory_transactions it
JOIN   products p  ON p.id  = it.product_id
JOIN   stores   st ON st.id = it.store_id
LEFT   JOIN profiles pr ON pr.id = it.performed_by;

CREATE OR REPLACE VIEW v_profit_summary AS
SELECT oi.order_id, o.order_number, o.organization_id, o.store_id,
       SUM(oi.quantity * oi.unit_price)             gross_sales,
       SUM(oi.discount_amount)                      discounts,
       SUM(oi.tax_amount)                           tax,
       SUM(oi.line_total)                           net_sales,
       SUM(oi.quantity * oi.cost_price_snapshot)    cogs,
       SUM(oi.line_total - oi.quantity * oi.cost_price_snapshot) gross_profit
FROM   order_items oi
JOIN   orders o ON o.id = oi.order_id
WHERE  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY oi.order_id, o.order_number, o.organization_id, o.store_id;

CREATE OR REPLACE VIEW v_store_performance AS
SELECT o.organization_id, o.store_id, st.store_name,
       date_trunc('month', o.created_at)::date AS sale_month,
       COUNT(o.id)::bigint order_count,
       COALESCE(SUM(o.total_amount),0) gross_sales,
       COALESCE(SUM(o.discount_amount),0) total_discounts,
       COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type<>'REFUND'),0) collected,
       COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status='SUCCESS' AND pay.payment_type='REFUND'),0) refunded
FROM   orders o
JOIN   stores st ON st.id = o.store_id
LEFT   JOIN payments pay ON pay.order_id = o.id
WHERE  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY o.organization_id, o.store_id, st.store_name, sale_month;

CREATE OR REPLACE VIEW v_product_performance AS
SELECT oi.product_id, p.product_name, p.sku, p.product_type, o.organization_id,
       COUNT(oi.id)::bigint units_sold,
       SUM(oi.line_total)   revenue,
       SUM(oi.discount_amount) discounts
FROM   order_items oi
JOIN   products p ON p.id = oi.product_id
JOIN   orders   o ON o.id = oi.order_id
WHERE  o.order_status NOT IN ('CANCELLED','DRAFT') AND o.deleted_at IS NULL
GROUP  BY oi.product_id, p.product_name, p.sku, p.product_type, o.organization_id;

CREATE OR REPLACE VIEW v_audit_activity AS
SELECT al.*, pr.full_name actor_name, pr.role actor_role, st.store_name
FROM   audit_logs al
LEFT   JOIN profiles pr ON pr.id = al.user_id
LEFT   JOIN stores   st ON st.id = al.store_id;

CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT
  al.user_id, pr.full_name, pr.role, al.organization_id,
  COUNT(*) FILTER (WHERE al.action='CANCEL_ORDER')               cancelled_orders,
  COUNT(*) FILTER (WHERE al.action='CREATE_PAYMENT')             payments_created,
  COUNT(*) FILTER (WHERE al.action LIKE '%REFUND%')              refunds_created,
  COUNT(*) FILTER (WHERE al.action='DISCOUNT')                   discounts_created,
  COUNT(*) FILTER (WHERE al.action='STOCK_ADJUSTMENT')           inv_adjustments,
  COUNT(*) FILTER (WHERE al.action LIKE '%MODIFICATION_ATTEMPT%') mod_attempts,
  COUNT(*) FILTER (WHERE al.action LIKE '%DELETE%ATTEMPT%')       del_attempts,
  MIN(al.created_at) first_seen,
  MAX(al.created_at) last_seen
FROM   audit_logs al
JOIN   profiles pr ON pr.id = al.user_id
WHERE  al.created_at > now() - interval '30 days'
GROUP  BY al.user_id, pr.full_name, pr.role, al.organization_id
HAVING COUNT(*) FILTER (WHERE al.action='CANCEL_ORDER') > 3
    OR COUNT(*) FILTER (WHERE al.action LIKE '%REFUND%') > 3
    OR COUNT(*) FILTER (WHERE al.action='DISCOUNT') > 5
    OR COUNT(*) FILTER (WHERE al.action='STOCK_ADJUSTMENT') > 5
    OR COUNT(*) FILTER (WHERE al.action LIKE '%ATTEMPT%') > 0;


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE frame_details         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_details          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_inventory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS
DROP POLICY IF EXISTS "organizations_own" ON organizations;
CREATE POLICY "organizations_own" ON organizations FOR ALL
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- STORES — everyone in org reads; only admins write
DROP POLICY IF EXISTS "stores_read" ON stores;
CREATE POLICY "stores_read" ON stores FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "stores_admin_write" ON stores;
CREATE POLICY "stores_admin_write" ON stores FOR ALL
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN'));

-- PROFILES — self always; admins see all in org
DROP POLICY IF EXISTS "profiles_self" ON profiles;
CREATE POLICY "profiles_self" ON profiles FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin" ON profiles;
CREATE POLICY "profiles_admin" ON profiles FOR ALL
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','STORE_MANAGER'));

-- PRODUCTS — org reads; inventory/admin writes
DROP POLICY IF EXISTS "products_read" ON products;
CREATE POLICY "products_read" ON products FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "products_write" ON products;
CREATE POLICY "products_write" ON products FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER'));

DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER'));

-- CUSTOMERS
DROP POLICY IF EXISTS "customers_read" ON customers;
CREATE POLICY "customers_read" ON customers FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND deleted_at IS NULL);

DROP POLICY IF EXISTS "customers_write" ON customers;
CREATE POLICY "customers_write" ON customers FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','STORE_MANAGER','EMPLOYEE'));

-- ORDERS — employees see own store; admins see all
DROP POLICY IF EXISTS "orders_read" ON orders;
CREATE POLICY "orders_read" ON orders FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','ACCOUNTANT')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "orders_create" ON orders;
CREATE POLICY "orders_create" ON orders FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  AND store_id    = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','STORE_MANAGER'));

-- PAYMENTS — employees see own store; no direct update/delete
DROP POLICY IF EXISTS "payments_read" ON payments;
CREATE POLICY "payments_read" ON payments FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','ACCOUNTANT','STORE_MANAGER')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  AND store_id    = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid()));

-- STORE INVENTORY — read only via RLS; writes via SECURITY DEFINER functions
DROP POLICY IF EXISTS "inventory_read" ON store_inventory;
CREATE POLICY "inventory_read" ON store_inventory FOR SELECT
  USING ((SELECT organization_id FROM stores WHERE id = store_id)
         = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER','ACCOUNTANT')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

-- INVENTORY TRANSACTIONS — read only
DROP POLICY IF EXISTS "inv_tx_read" ON inventory_transactions;
CREATE POLICY "inv_tx_read" ON inventory_transactions FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER','ACCOUNTANT')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

-- AUDIT LOGS
DROP POLICY IF EXISTS "audit_admin_read" ON audit_logs;
CREATE POLICY "audit_admin_read" ON audit_logs FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','STORE_MANAGER','ACCOUNTANT'));

DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notif_read" ON notifications;
CREATE POLICY "notif_read" ON notifications FOR SELECT
  USING (user_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN'));

DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- STOCK TRANSFERS
DROP POLICY IF EXISTS "transfers_read" ON stock_transfers;
CREATE POLICY "transfers_read" ON stock_transfers FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER')
         OR source_store_id      = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())
         OR destination_store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

-- RETURNS
DROP POLICY IF EXISTS "returns_read" ON returns;
CREATE POLICY "returns_read" ON returns FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','ACCOUNTANT','STORE_MANAGER')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

-- PRESCRIPTIONS
DROP POLICY IF EXISTS "prescriptions_read" ON prescriptions;
CREATE POLICY "prescriptions_read" ON prescriptions FOR SELECT
  USING ((SELECT organization_id FROM customers WHERE id = customer_id)
         = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "prescriptions_write" ON prescriptions;
CREATE POLICY "prescriptions_write" ON prescriptions FOR INSERT WITH CHECK (
  (SELECT organization_id FROM customers WHERE id = customer_id)
  = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- SIMPLE ORG-SCOPED POLICIES
DROP POLICY IF EXISTS "brands_org"     ON brands;
CREATE POLICY "brands_org"     ON brands     FOR ALL USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "categories_org" ON categories;
CREATE POLICY "categories_org" ON categories FOR ALL USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "settings_org"   ON settings;
CREATE POLICY "settings_org"   ON settings   FOR ALL USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "seqdoc_org"     ON document_sequences;
CREATE POLICY "seqdoc_org"     ON document_sequences FOR ALL USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "price_hist_read" ON price_history;
CREATE POLICY "price_hist_read" ON price_history FOR SELECT
  USING ((SELECT organization_id FROM products WHERE id = product_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN'));

DROP POLICY IF EXISTS "frame_details_read" ON frame_details;
CREATE POLICY "frame_details_read" ON frame_details FOR SELECT
  USING ((SELECT organization_id FROM products WHERE id = product_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "lens_details_read" ON lens_details;
CREATE POLICY "lens_details_read" ON lens_details FOR SELECT
  USING ((SELECT organization_id FROM products WHERE id = product_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "order_items_read" ON order_items;
CREATE POLICY "order_items_read" ON order_items FOR SELECT
  USING ((SELECT organization_id FROM orders WHERE id = order_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "discounts_read" ON discounts;
CREATE POLICY "discounts_read" ON discounts FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','STORE_MANAGER','ACCOUNTANT'));

DROP POLICY IF EXISTS "inv_items_read" ON inventory_items;
CREATE POLICY "inv_items_read" ON inventory_items FOR SELECT
  USING ((SELECT organization_id FROM stores WHERE id = store_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "stock_count_read" ON stock_counts;
CREATE POLICY "stock_count_read" ON stock_counts FOR SELECT
  USING ((SELECT organization_id FROM stores WHERE id = store_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN','ADMIN','INVENTORY_MANAGER','STORE_MANAGER')
         OR store_id = (SELECT assigned_store_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "payment_alloc_read" ON payment_allocations;
CREATE POLICY "payment_alloc_read" ON payment_allocations FOR SELECT
  USING ((SELECT organization_id FROM payments WHERE id = payment_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "return_items_read" ON return_items;
CREATE POLICY "return_items_read" ON return_items FOR SELECT
  USING ((SELECT organization_id FROM returns WHERE id = return_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "transfer_items_read" ON stock_transfer_items;
CREATE POLICY "transfer_items_read" ON stock_transfer_items FOR SELECT
  USING ((SELECT organization_id FROM stock_transfers WHERE id = transfer_id) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "stock_count_items_read" ON stock_count_items;
CREATE POLICY "stock_count_items_read" ON stock_count_items FOR SELECT
  USING ((SELECT organization_id FROM stores st JOIN stock_counts sc ON sc.store_id=st.id WHERE sc.id=stock_count_id LIMIT 1) = (SELECT organization_id FROM profiles WHERE id = auth.uid()));


-- Seed data removed. All data is entered by the client through the application.

-- ---------------------------------------------------------------------------
-- MIGRATION RECORD
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       text        PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (name)
VALUES ('20250001000000_production_schema')
ON CONFLICT DO NOTHING;

