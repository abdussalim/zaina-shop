-- Toko Zaina Cloudflare D1 (SQLite) Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(username)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_username_lower ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_categories_name_lower ON categories (LOWER(name));

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  location TEXT,
  base_unit TEXT NOT NULL,
  cost_price INTEGER NOT NULL DEFAULT 0,
  sale_price INTEGER NOT NULL DEFAULT 0,
  minimum_stock REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (cost_price >= 0),
  CHECK (sale_price >= 0),
  CHECK (minimum_stock >= 0),
  CHECK (length(trim(name)) > 0),
  CHECK (length(trim(sku)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_products_sku_lower ON products (LOWER(sku));
CREATE UNIQUE INDEX IF NOT EXISTS uk_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products (category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (LOWER(name));

CREATE TABLE IF NOT EXISTS product_units (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  factor REAL NOT NULL,
  sale_price INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
  minimum_discount REAL NOT NULL DEFAULT 0,
  maximum_discount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (factor > 0),
  CHECK (sale_price >= 0),
  CHECK (length(trim(name)) > 0),
  CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  CHECK (minimum_discount >= 0 AND maximum_discount >= minimum_discount)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_product_units_active_name_lower ON product_units (product_id, LOWER(name)) WHERE is_active = 1;
CREATE UNIQUE INDEX IF NOT EXISTS uk_product_units_default ON product_units (product_id) WHERE is_default = 1;
CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units (product_id);

CREATE TABLE IF NOT EXISTS inventory_balances (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
  quantity_base REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (quantity_base >= 0)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sale_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  sold_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  cancelled_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('COMPLETED', 'CANCELLED')),
  CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0 AND amount_paid >= 0 AND change_amount >= 0),
  CHECK (total = subtotal - discount),
  CHECK (amount_paid >= total AND change_amount = amount_paid - total)
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales (sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_status_sold_at ON sales (status, sold_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  unit_id TEXT NOT NULL REFERENCES product_units(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  factor_snapshot REAL NOT NULL,
  quantity_input REAL NOT NULL,
  quantity_base REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  cost_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  discount_type_snapshot TEXT NOT NULL DEFAULT 'PERCENTAGE',
  minimum_discount_snapshot REAL NOT NULL DEFAULT 0,
  maximum_discount_snapshot REAL NOT NULL DEFAULT 0,
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (factor_snapshot > 0 AND quantity_input > 0 AND quantity_base > 0),
  CHECK (unit_price >= 0 AND cost_price >= 0 AND subtotal >= 0),
  CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  CHECK (total = subtotal - discount_amount)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items (product_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  unit_id TEXT NOT NULL REFERENCES product_units(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_input REAL NOT NULL,
  factor_snapshot REAL NOT NULL,
  quantity_base REAL NOT NULL,
  balance_after REAL NOT NULL,
  unit_cost INTEGER,
  supplier_name TEXT,
  reference_id TEXT,
  external_reference TEXT,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (movement_type IN (
    'OPENING', 'RECEIPT', 'SALE', 'SALE_REVERSAL', 'DAMAGE',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'RETURN_OUT'
  )),
  CHECK (quantity_input > 0 AND factor_snapshot > 0 AND quantity_base <> 0 AND balance_after >= 0),
  CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created ON stock_movements (movement_type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  store_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  default_minimum_stock REAL NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (id = 1),
  CHECK (default_minimum_stock >= 0)
);
