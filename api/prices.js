import { createClient } from '@supabase/supabase-js';
import { CURRENCY_BY_LANG, PRICE_TABLE } from '../lib/pricing.js';

// GET /api/prices — ціни; GET /api/prices?stats=1 — публічна статистика для головної.
// Статистика живе тут, бо в папці api може бути максимум 12 файлів.
export default async function handler(req, res) {
  if (req.query && req.query.stats) return stats(res);
  // POST /api/prices?tgcheck=1 { initData } — перевірка підпису міні-апки
  if (req.query && req.query.tgcheck) {
    // динамічний імпорт: якщо lib/telegram.js старий, ціни все одно працюють
    try {
      const { diagnoseInitData } = await import('../lib/telegram.js');
      return res.json(diagnoseInitData(req.body && req.body.initData));
    } catch (e) {
      return res.status(500).json({ error: 'tgcheck_unavailable' });
    }
  }
  res.json({ currencies: CURRENCY_BY_LANG, prices: PRICE_TABLE });
}

// тільки агреговані числа, без ключів і ніків
async function stats(res) {
  const out = { online: null, users: null, rating: null, reviews: 0 };
  let sb;
  try { sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); } catch { return res.json(out); }
  try {
    const { count } = await sb.from('licenses')
      .select('key_string', { count: 'exact', head: true })
      .eq('status', 'active').not('activated_at', 'is', null);
    out.users = count ?? null;
  } catch {}
  try {
    const { data } = await sb.from('reviews').select('stars').eq('approved', true);
    if (data && data.length) {
      out.reviews = data.length;
      out.rating = +(data.reduce((s, r) => s + Number(r.stars || 0), 0) / data.length).toFixed(1);
    }
  } catch {}
  try {
    // гравці з модулем Socials, що відмічались за останні 3 хвилини (таблиця з socials.sql)
    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { count, error } = await sb.from('zv_social')
      .select('nickname', { count: 'exact', head: true }).gt('last_seen', since);
    if (!error) out.online = count ?? 0;
  } catch {}
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  res.json(out);
}
