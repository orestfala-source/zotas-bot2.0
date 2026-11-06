import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Возвращает оплаченные ключи текущего Telegram-аккаунта, которые ещё не истекли
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ error: 'Неверная подпись Telegram' });

  const { data, error } = await sb
    .from('licenses')
    .select('key_string, tariff_days, activated_at, expires_at, created_at, channel')
    .eq('tg_id', user.id)
    .eq('status', 'active')
    .eq('source', 'payment')
    .order('created_at', { ascending: false });
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
