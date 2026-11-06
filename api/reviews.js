import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Код языка сайта -> код языка DeepL
const TARGET = { uk: 'UK', ru: 'RU', en: 'EN-US', pl: 'PL' };

async function deepl(texts, target) {
  const base = process.env.DEEPL_API_URL || 'https://api-free.deepl.com';
  const r = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: texts, target_lang: target }),
  });
  if (!r.ok) throw new Error(`DeepL ${r.status}`);
  const j = await r.json();
  return j.translations;
}

export default async function handler(req, res) {
  // Публичный список отзывов на языке интерфейса. Переводы кешируются в базе.
  if (req.method === 'GET') {
    const lang = TARGET[req.query.lang] ? req.query.lang : 'uk';
    let { data, error } = await sb
      .from('reviews')
      .select('id, stars, text, created_at, translations')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      // Колонка translations может быть ещё не создана (блок 7 в supabase.sql)
      console.error('reviews select', error.message);
      ({ data, error } = await sb
        .from('reviews')
        .select('id, stars, text, created_at')
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(50));
      if (error) return res.status(500).json({ reason: 'error' });
    }

    const rows = data || [];
    const missing = rows.filter(r => !(r.translations && r.translations[lang]));

    if (missing.length && process.env.DEEPL_API_KEY) {
      try {
        const results = await deepl(missing.map(r => r.text), TARGET[lang]);
        await Promise.all(results.map(async (tr, i) => {
          const r = missing[i];
          // Если отзыв уже на нужном языке, оставляем оригинал
          const sameLang = String(tr.detected_source_language || '').toUpperCase()
            .startsWith(TARGET[lang].slice(0, 2));
          r.translations = { ...(r.translations || {}), [lang]: sameLang ? r.text : tr.text };
          await sb.from('reviews').update({ translations: r.translations }).eq('id', r.id);
        }));
      } catch (e) {
        // Если перевод недоступен, показываем оригинал
        console.error('translate error', e);
      }
    }

    return res.json({
      reviews: rows.map(r => ({
        stars: r.stars,
        text: (r.translations && r.translations[lang]) || r.text,
        created_at: r.created_at,
      })),
    });
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
