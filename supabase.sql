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

-- 4. Дата первой активации ключа: срок считается от неё
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- 5. Валюта, в которой оплачен заказ (сумма в аналитике хранится в рублях)
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS currency text;
NOTIFY pgrst, 'reload schema';

-- 6. Отзывы покупателей (публично показываются только stars и text)
CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  tg_id bigint NOT NULL UNIQUE,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved boolean NOT NULL DEFAULT true
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';

-- 7. Кеш переводов отзывов (ключ: код языка сайта, например "en")
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';

-- 8. Канал ключа: stable или beta (beta получает обновления раньше)
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'stable';
NOTIFY pgrst, 'reload schema';
