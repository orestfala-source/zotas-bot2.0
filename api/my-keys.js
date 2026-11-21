import { createClient } from '@supabase/supabase-js';
import { resolveBuyer, accountKeysQuery } from '../lib/account.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Возвращает оплаченные ключи текущего Telegram-аккаунта, которые ещё не истекли
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const buyer = await resolveBuyer(req.body);
  if (!buyer) return res.status(401).json({ error: 'need_login' });

  // Відкрили сайт у Telegram і увійшли в акаунт Zontas — привʼязуємо Telegram до акаунта,
  // а ключі, куплені через Telegram, — до цього акаунта
  if (buyer.kind === 'tg' && buyer.uid && buyer.tg && buyer.tg.id) {
    try {
      await sb.from('zv_profiles').update({ tg_username: buyer.tg.username || null, tg_id: buyer.tg.id }).eq('user_id', buyer.uid);
      await sb.from('licenses').update({ user_id: buyer.uid }).eq('tg_id', buyer.tg.id).is('user_id', null);
    } catch (e) { console.warn('[my-keys] tg link', e); }
  }

  let q;
  if (buyer.kind === 'account') {
    q = accountKeysQuery(sb.from('licenses').select('key_string, tariff_days, activated_at, expires_at, created_at, channel'), buyer)
      .eq('status', 'active').order('created_at', { ascending: false });
  } else {
  const user = buyer.tg;

  // запам'ятовуємо актуальний username власника (міг змінитися в Telegram)
  if (user.username) {
    await sb.from('licenses').update({ tg_username: user.username }).eq('tg_id', user.id).eq('source', 'payment');
  }

  q = sb
    .from('licenses')
    .select('key_string, tariff_days, activated_at, expires_at, created_at, channel')
    .eq('tg_id', user.id)
    .eq('status', 'active')
    .eq('source', 'payment')
    .order('created_at', { ascending: false });
  }
  let { data, error } = await q;
  // Telegram + акаунт сайту одночасно — показуємо ключі з обох
  if (!error && buyer.kind === 'tg' && buyer.uid) {
    const { data: more } = await accountKeysQuery(sb.from('licenses').select('key_string, tariff_days, activated_at, expires_at, created_at, channel'), buyer).eq('status', 'active');
    const seen = new Set((data || []).map(k => k.key_string));
    data = [...(data || []), ...(more || []).filter(k => !seen.has(k.key_string))];
  }
  if (error) return res.status(500).json({ error: error.message });

  const now = Date.now();
  const keys = (data || [])
    .filter(k => !k.expires_at || new Date(k.expires_at).getTime() > now)
    .map(k => ({
      key: k.key_string,
      tariff_days: Number(k.tariff_days),
      activated_at: k.activated_at,
      expires_at: k.expires_at,
      forever: Number(k.tariff_days) === 0,
      channel: k.channel || 'stable',
    }));

  res.json({ keys });
}
