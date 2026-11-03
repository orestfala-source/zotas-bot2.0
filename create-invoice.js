import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRICES = { 30: 150, 60: 250, 90: 400, 180: 555, 0: 900 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tariffId, promo, initData } = req.body || {};
  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Неверная подпись Telegram' });
  if (!(tariffId in PRICES)) return res.status(400).json({ error: 'Неизвестный тариф' });

  let amount = PRICES[tariffId];
  let promoCode = null;
  if (promo) {
    const code = String(promo).trim().toUpperCase();
    const { data } = await sb
      .from('promo_codes').select('code, discount_percent, active')
      .eq('code', code).maybeSingle();
    if (data && data.active) {
      promoCode = data.code;
      amount = +(amount * (1 - data.discount_percent / 100)).toFixed(2);
    }
  }

  const r = await fetch('https://pay.crypt.bot/api/createInvoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': process.env.CRYPTOBOT_TOKEN,
    },
    body: JSON.stringify({
      currency_type: 'fiat',
      fiat: 'RUB',
      amount: String(amount),
      description: `Zontas Visuals — ${tariffId ? tariffId + ' дней' : 'Навсегда'}`,
      payload: JSON.stringify({ tg_id: user.id, tariffId, promo: promoCode, amount }),
      expires_in: 1800,
    }),
  });
  const json = await r.json();
  if (!json.ok) return res.status(500).json({ error: json.error?.name || 'CryptoBot error' });

  res.json({ invoice_id: json.result.invoice_id, pay_url: json.result.bot_invoice_url });
}
