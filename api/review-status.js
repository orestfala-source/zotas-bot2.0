import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ error: 'Неверная подпись Telegram' });

  const { data: bought } = await sb
    .from('licenses').select('key_string')
    .eq('tg_id', user.id).eq('source', 'payment').limit(1);
  const { data: rev } = await sb
    .from('reviews').select('tg_id').eq('tg_id', user.id).limit(1);

  res.json({ bought: !!(bought && bought.length), reviewed: !!(rev && rev.length) });
}
