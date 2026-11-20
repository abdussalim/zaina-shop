-- Seed Data Initial Toko Zaina

-- 1. Default Admin User (username: toko, password: admin123)
INSERT OR IGNORE INTO users (id, username, display_name, password_hash, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'toko',
  'Pengelola Toko',
  'pbkdf2:100000:01010101010101010101010101010101:df97338aac3fcdbe773b88f00a276b9fd832ff6d00ef3ecd91b56d40677c119a',
  1
);

-- 2. Store Settings
INSERT OR IGNORE INTO store_settings (id, store_name, address, phone, timezone, default_minimum_stock)
VALUES (
  1,
  'Toko Zaina',
  'Jl. Pasar No. 12',
  '081234567890',
  'Asia/Jakarta',
  5
);

-- 3. Default Categories
INSERT OR IGNORE INTO categories (id, name, color, is_active)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Pecah Belah', '#B96947', 1),
  ('10000000-0000-4000-8000-000000000002', 'Perabot Dapur', '#66704A', 1),
  ('10000000-0000-4000-8000-000000000003', 'Peralatan Rumah', '#50727B', 1),
  ('10000000-0000-4000-8000-000000000004', 'Plastik', '#A87C3D', 1);
