import { createClient } from '@supabase/supabase-js';
import { verifyInitData, isAdmin } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TARIFFS = [
  { days: 30, label: '30 дней' },
  { days: 60, label: '60 дней' },
  { days: 90, label: '90 дней' },
  { days: 180, label: '180 дней' },
  { days: 0, label: 'Навсегда' },
];

const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);

function summarize(rows) {
  return {
    count: rows.length,
    revenue: +sum(rows).toFixed(2),
    byTariff: TARIFFS.map(t => {
      const r = rows.filter(x => Number(x.tariff_days) === t.days);
      return { label: t.label, count: r.length, revenue: +sum(r).toFixed(2) };
    }),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ error: 'Неверная подпись Telegram' });

  const { data: promos, error: pErr } = await sb
    .from('promo_codes').select('code, discount_percent, owner_username');
  if (pErr) return res.status(500).json({ error: pErr.message });

  const { data: rows, error: rErr } = await sb
    .from('licenses').select('tariff_days, amount, promo_code').eq('source', 'payment');
  if (rErr) return res.status(500).json({ error: rErr.message });

  if (isAdmin(user)) {
    return res.json({
      role: 'admin',
      total: summarize(rows),
      promos: promos.map(p => ({
        code: p.code,
        discount_percent: p.discount_percent,
        owner: p.owner_username,
        ...summarize(rows.filter(r => r.promo_code === p.code)),
      })),
      noPromo: summarize(rows.filter(r => !r.promo_code)),
    });
  }

  // Владелец промокода видит только свои промокоды
  const username = String(user.username || '').toLowerCase();
  const own = promos.filter(p => username && String(p.owner_username || '').toLowerCase() === username);
  if (!own.length) return res.status(403).json({ error: 'Нет доступа' });

  const codes = own.map(p => p.code);
  const mine = rows.filter(r => codes.includes(r.promo_code));
  res.json({
    role: 'owner',
    total: summarize(mine),
    promos: own.map(p => ({
      code: p.code,
      discount_percent: p.discount_percent,
      owner: p.owner_username,
      ...summarize(mine.filter(r => r.promo_code === p.code)),
    })),
  });
}
