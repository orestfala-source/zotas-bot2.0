-- Zontas Visuals: усі колонки, які потрібні сайту, адмінці й лаунчеру.
-- Supabase → SQL Editor → встав і натисни Run (можна запускати повторно).
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS source       text DEFAULT 'admin';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tariff_days  int;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS amount       numeric;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS promo_code   text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS currency     text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS channel      text NOT NULL DEFAULT 'stable';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tg_username  text;   -- кому видано ключ
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tg_name      text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS issued_by    text;   -- хто з адмінів видав
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS zv_hwid      text;   -- привʼязка до ПК (лаунчер)
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS hwid_at      timestamptz;
CREATE INDEX IF NOT EXISTS licenses_tg_username_idx ON licenses (lower(tg_username));
NOTIFY pgrst, 'reload schema';

-- Акаунти сайту (пошта + пароль): до якого акаунта привʼязаний ключ
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS email   text;
CREATE INDEX IF NOT EXISTS licenses_user_id_idx ON licenses (user_id);
CREATE INDEX IF NOT EXISTS licenses_email_idx   ON licenses (lower(email));
NOTIFY pgrst, 'reload schema';
