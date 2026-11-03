-- 1. Таблица промокодов с привязкой к владельцу (Telegram username без @)
CREATE TABLE IF NOT EXISTS promo_codes (
  code text PRIMARY KEY,
  discount_percent int NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  owner_username text,
  active boolean NOT NULL DEFAULT true
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- 2. Поля для аналитики в таблице licenses
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tariff_days int;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 3. Примеры промокодов (замените owner_username на нужный username без @)
INSERT INTO promo_codes (code, discount_percent, owner_username)
VALUES ('MEDIA10', 10, 'orest6752')
ON CONFLICT (code) DO NOTHING;
