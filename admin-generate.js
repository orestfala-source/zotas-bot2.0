import { createClient } from '@supabase/supabase-js';
import { verifyInitData, isAdmin } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAYS = { 30: 30, 60: 60, 90: 90, 180: 180, 0: null };

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ZV-${seg()}-${seg()}-${seg()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!isAdmin(user)) return res.status(403).json({ error: 'Нет доступа' });

  const tariffId = req.body.tariffId;
  if (!(tariffId in DAYS)) return res.status(400).json({ error: 'Неизвестный тариф' });

  const days = DAYS[tariffId];
  const key = generateKey();
  const { error } = await sb.from('licenses').insert({
    key_string: key,
    status: 'active',
    expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ key });
}
