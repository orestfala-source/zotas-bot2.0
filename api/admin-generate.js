import { createClient } from '@supabase/supabase-js';
import { verifyInitData, isAdmin } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VALID_DAYS = [30, 60, 90, 180, 0];

function generateKey(prefix = 'ZV') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${seg()}-${seg()}-${seg()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!isAdmin(user)) return res.status(403).json({ error: 'Нет доступа' });

  const raw = req.body.tariffId;
  const isBeta = raw === 'beta';
  const days = isBeta ? 0 : Number(raw);
  if (!isBeta && !VALID_DAYS.includes(days)) return res.status(400).json({ error: 'Неизвестный тариф' });

  const key = generateKey(isBeta ? 'ZB' : 'ZV');
  // срок начнётся при активации ключа
  const { error } = await sb.from('licenses').insert({
    key_string: key,
    status: 'active',
    source: 'admin',
    channel: isBeta ? 'beta' : 'stable',
    tariff_days: days,
    expires_at: null,
    activated_at: null,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ key });
}
