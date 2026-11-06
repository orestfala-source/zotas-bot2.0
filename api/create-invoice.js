import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';
import { PRICE_TABLE } from '../lib/pricing.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tariffId, promo, initData, currency: reqCurrency } = req.body || {};
  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Неверная подпись Telegram' });

  const currency = PRICE_TABLE[reqCurrency] ? reqCurrency : 'RUB';
  const table = PRICE_TABLE[currency];
  if (!(tariffId in table)) return res.status(400).json({ error: 'Неизвестный тариф' });

  let discount = 0;
  let promoCode = null;
  if (promo) {
    const code = String(promo).trim().toUpperCase();
    const { data } = await sb
      .from('promo_codes').select('code, discount_percent, active')
      .eq('code', code).maybeSingle();
    if (data && data.active) {
      promoCode = data.code;
      discount = data.discount_percent;
    }
  }

  const amount = +(table[tariffId] * (1 - discount / 100)).toFixed(2);
  // В аналитике все суммы храним в рублях, поэтому сохраняем рублёвый эквивалент
  const amountRub = +(PRICE_TABLE.RUB[tariffId] * (1 - discount / 100)).toFixed(2);

  const label = tariffId === 'beta' ? 'Beta (навсегда)' : tariffId ? `${tariffId} дней` : 'Навсегда';

  const r = await fetch('https://pay.crypt.bot/api/createInvoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': process.env.CRYPTOBOT_TOKEN,
    },
    body: JSON.stringify({
      currency_type: 'fiat',
      fiat: currency,
      amount: String(amount),
      description: `Zontas Visuals — ${label}`,
      payload: JSON.stringify({ tg_id: user.id, tariffId, promo: promoCode, currency, amount: amountRub }),
      expires_in: 1800,
    }),
  });
  const json = await r.json();
  if (!json.ok) return res.status(500).json({ error: json.error?.name || 'CryptoBot error' });

  res.json({ invoice_id: json.result.invoice_id, pay_url: json.result.bot_invoice_url });
}
