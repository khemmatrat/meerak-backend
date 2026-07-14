-- Phase 3: food-svc — restaurants, menu, carts, delivery zones (commerce database)

ALTER TABLE commerce.stores
  ADD COLUMN IF NOT EXISTS store_type TEXT NOT NULL DEFAULT 'retail';

CREATE TABLE IF NOT EXISTS commerce.food_delivery_zones (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km NUMERIC(6,2),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS commerce.food_restaurants (
  id TEXT PRIMARY KEY,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  rating NUMERIC(4,2) NOT NULL DEFAULT 4.5,
  review_count INT NOT NULL DEFAULT 0,
  distance_km NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  prep_min INT NOT NULL DEFAULT 15,
  delivery_fee_micro BIGINT NOT NULL DEFAULT 2000,
  min_order_micro BIGINT NOT NULL DEFAULT 8000,
  open_default BOOLEAN NOT NULL DEFAULT TRUE,
  tags JSONB NOT NULL DEFAULT '[]',
  zone_id TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_restaurants_zone ON commerce.food_restaurants (zone_id, region);

CREATE TABLE IF NOT EXISTS commerce.food_menu_items (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES commerce.food_restaurants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_micro BIGINT NOT NULL,
  image_url TEXT,
  spicy BOOLEAN NOT NULL DEFAULT FALSE,
  popular BOOLEAN NOT NULL DEFAULT FALSE,
  options_json JSONB,
  sold_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_menu_merchant ON commerce.food_menu_items (merchant_id);

CREATE TABLE IF NOT EXISTS commerce.food_carts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  delivery_mode TEXT NOT NULL DEFAULT 'normal' CHECK (delivery_mode IN ('express','normal','saver')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_carts_owner ON commerce.food_carts (owner_id);

CREATE TABLE IF NOT EXISTS commerce.food_cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES commerce.food_carts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_micro BIGINT NOT NULL DEFAULT 0,
  options_json JSONB,
  options_sig TEXT NOT NULL DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, item_id, options_sig)
);
CREATE INDEX IF NOT EXISTS idx_food_cart_items_cart ON commerce.food_cart_items (cart_id);

-- delivery zones
INSERT INTO commerce.food_delivery_zones (id, label, center_lat, center_lng, radius_km) VALUES
  ('sathorn', 'สาทร · สีลม', 13.724, 100.534, 4.0),
  ('rama9', 'พระราม 9', 13.758, 100.565, 5.0)
ON CONFLICT (id) DO NOTHING;

-- seed merchants + restaurant stores
INSERT INTO commerce.merchants (id, shard_key, region, name, tier, status) VALUES
  ('food-thai-1', '0', 'TH', 'ครัวบ้านสวน', 'free', 'active'),
  ('food-jp-1', '0', 'TH', 'ซูชิโฮมุระ', 'free', 'active'),
  ('food-cafe-1', '0', 'TH', 'Matcha House', 'free', 'active'),
  ('food-street-1', '0', 'TH', 'ก๋วยเตี๋ยวลุงแดง', 'free', 'active'),
  ('food-pizza-1', '0', 'TH', 'Pizza Corner', 'free', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.stores (id, merchant_id, shard_key, region, slug, display_name, status, store_type) VALUES
  ('food-thai-1', 'food-thai-1', '0', 'TH', 'food-thai-1', 'ครัวบ้านสวน', 'active', 'restaurant'),
  ('food-jp-1', 'food-jp-1', '0', 'TH', 'food-jp-1', 'ซูชิโฮมุระ', 'active', 'restaurant'),
  ('food-cafe-1', 'food-cafe-1', '0', 'TH', 'food-cafe-1', 'Matcha House', 'active', 'restaurant'),
  ('food-street-1', 'food-street-1', '0', 'TH', 'food-street-1', 'ก๋วยเตี๋ยวลุงแดง', 'active', 'restaurant'),
  ('food-pizza-1', 'food-pizza-1', '0', 'TH', 'food-pizza-1', 'Pizza Corner', 'active', 'restaurant')
ON CONFLICT (id) DO UPDATE SET store_type = EXCLUDED.store_type;

INSERT INTO commerce.food_restaurants (
  id, shard_key, name, cuisine, emoji, rating, review_count, distance_km, prep_min,
  delivery_fee_micro, min_order_micro, open_default, tags, zone_id, lat, lng
) VALUES
  ('food-thai-1', '0', 'ครัวบ้านสวน', 'อาหารไทย', '🍛', 4.7, 328, 0.8, 12, 2500, 8000, TRUE, '["ผัดไทย","ต้มยำ"]', 'sathorn', 13.724, 100.534),
  ('food-jp-1', '0', 'ซูชิโฮมุระ', 'ญี่ปุ่น', '🍣', 4.5, 192, 1.2, 18, 3500, 12000, TRUE, '["ซูชิ","เซ็ต"]', 'sathorn', 13.721, 100.531),
  ('food-cafe-1', '0', 'Matcha House', 'คาเฟ่', '☕', 4.8, 510, 0.5, 8, 2000, 6000, TRUE, '["matcha","เบเกอรี่"]', 'sathorn', 13.726, 100.536),
  ('food-street-1', '0', 'ก๋วยเตี๋ยวลุงแดง', 'เส้น · อาหารตามสั่ง', '🍜', 4.4, 891, 1.6, 10, 2000, 5000, TRUE, '["ก๋วยเตี๋ยว","หมูตุ๋น"]', 'sathorn', 13.719, 100.538),
  ('food-pizza-1', '0', 'Pizza Corner', 'อิตาเลียน', '🍕', 4.3, 144, 2.1, 20, 4000, 15000, FALSE, '["พิซซ่า","พาสต้า"]', 'rama9', 13.758, 100.565)
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.food_menu_items (id, merchant_id, title, description, price_micro, spicy, popular, options_json) VALUES
  ('dish-padthai', 'food-thai-1', 'ผัดไทยกุ้งสด', 'เส้นจันท์ กุ้งใหญ่ ถั่วงอก', 8900, FALSE, TRUE, NULL),
  ('dish-tomyum', 'food-thai-1', 'ต้มยำกุ้ง', 'รสจัดจ้าน', 12900, TRUE, TRUE, NULL),
  ('dish-basil', 'food-thai-1', 'ผัดกะเพราไก่ + ไข่ดาว', NULL, 7900, TRUE, FALSE, NULL),
  ('dish-mango', 'food-thai-1', 'ข้าวเหนียวมะม่วง', NULL, 6900, FALSE, FALSE, NULL),
  ('dish-sushi-set', 'food-jp-1', 'เซ็ตซูชิ 12 ชิ้น', 'แซลมอน · ทูน่า · ปลาหมึก', 24900, FALSE, TRUE,
    '[{"id":"opt-wasabi","label":"เพิ่มวาซาบิ","price_micro":0},{"id":"opt-shoyu","label":"ซอสโชยุพิเศษ","price_micro":0},{"id":"opt-extra-ginger","label":"เพิ่มขิงดอง","price_micro":0},{"id":"opt-salmon2","label":"เพิ่มแซลมอน 2 ชิ้น","price_micro":4500}]'::jsonb),
  ('dish-salmon', 'food-jp-1', 'ซาชิมิแซลมอน', NULL, 18900, FALSE, FALSE, NULL),
  ('dish-ramen', 'food-jp-1', 'ราเมนโทนคอตสึ', NULL, 15900, FALSE, FALSE, NULL),
  ('dish-matcha-latte', 'food-cafe-1', 'Matcha Latte', 'ใบชาเกรดพรีเมียม', 8900, FALSE, TRUE, NULL),
  ('dish-croissant', 'food-cafe-1', 'ครัวซองต์เนยสด', NULL, 6900, FALSE, FALSE, NULL),
  ('dish-cake', 'food-cafe-1', 'เค้กช็อกโกแลต', NULL, 9900, FALSE, FALSE, NULL),
  ('dish-noodle-pork', 'food-street-1', 'ก๋วยเตี๋ยวหมูตุ๋น', NULL, 5500, FALSE, TRUE, NULL),
  ('dish-noodle-dry', 'food-street-1', 'บะหมี่แห้งหมูแดง', NULL, 5000, FALSE, FALSE, NULL),
  ('dish-wonton', 'food-street-1', 'เกี๊ยวน้ำ', NULL, 5500, FALSE, FALSE, NULL),
  ('dish-pizza-m', 'food-pizza-1', 'พิซซ่ามาร์เกอริต้า M', NULL, 19900, FALSE, TRUE, NULL),
  ('dish-pizza-pep', 'food-pizza-1', 'พิซซ่าเปปเปอร์โรนี M', NULL, 22900, FALSE, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE commerce.food_restaurants IS 'Phase 3 food-svc restaurant catalog';
COMMENT ON TABLE commerce.food_menu_items IS 'Phase 3 food-svc menu items per restaurant';
COMMENT ON TABLE commerce.food_carts IS 'Phase 3 persisted food delivery carts';
