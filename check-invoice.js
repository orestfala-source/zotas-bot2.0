import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAYS = { 30: 30, 60: 60, 90: 90, 180: 180, 0: null };

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ZV-${seg()}-${seg()}-${seg()}`;
}

export default async function handler(req, res) {
  const invoiceId = req.query.invoice_id;
  if (!invoiceId) return res.status(400).json({ error: 'no invoice_id' });

  const r = await fetch(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${encodeURIComponent(invoiceId)}`, {
    headers: { 'Crypto-Pay-API-Token': process.env.CRYPTOBOT_TOKEN },
  });
  const json = await r.json();
  const inv = json.result?.items?.[0];
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== 'paid') return res.json({ status: inv.status });

  // идемпотентность: ключ по этому инвойсу выдаётся один раз
  const { data: existing } = await sb
    .from('licenses').select('key_string').eq('invoice_id', String(invoiceId)).maybeSingle();
  if (existing) return res.json({ status: 'paid', license_key: existing.key_string });

  const payload = JSON.parse(inv.payload || '{}');
  const days = DAYS[payload.tariffId];
  const key = generateKey();
  const { error } = await sb.from('licenses').insert({
    key_string: key,
    status: 'active',
    expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
    invoice_id: String(invoiceId),
    tg_id: payload.tg_id ?? null,
  });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ status: 'paid', license_key: key });
}
