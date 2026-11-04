import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // Публичный список отзывов. Имена покупателей и tg_id не отдаются.
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('reviews')
      .select('stars, text, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ reason: 'error' });
    return res.json({ reviews: data || [] });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { initData, stars, text } = req.body || {};
  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ reason: 'unauthorized' });

  const s = Number(stars);
  if (!Number.isInteger(s) || s < 1 || s > 5) return res.status(400).json({ reason: 'bad_stars' });

  const clean = String(text || '').trim();
  if (clean.length < 3 || clean.length > 500) return res.status(400).json({ reason: 'bad_text' });

  // Оставить отзыв может только покупатель
  const { data: bought } = await sb
    .from('licenses').select('key_string')
    .eq('tg_id', user.id).eq('source', 'payment').limit(1);
  if (!bought || !bought.length) return res.status(403).json({ reason: 'not_buyer' });

  // UNIQUE на tg_id: один отзыв на аккаунт
  const { error } = await sb.from('reviews').insert({ tg_id: user.id, stars: s, text: clean });
  if (error) {
    if (error.code === '23505') return res.status(409).json({ reason: 'already' });
    return res.status(500).json({ reason: 'error' });
  }
  res.json({ ok: true });
}
