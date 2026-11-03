import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getLicense(key) {
  const { data } = await sb.from('licenses').select('*').eq('key_string', key).maybeSingle();
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const key = String(req.body?.key || '').trim().toUpperCase();
  if (!key) return res.status(400).json({ valid: false, reason: 'no_key' });

  let lic = await getLicense(key);
  if (!lic || lic.status !== 'active') return res.json({ valid: false, reason: 'not_found' });

  const now = new Date();

  // Таймер запускается при первой активации, а не при покупке
  if (!lic.activated_at) {
    const patch = { activated_at: now.toISOString() };
    if (lic.tariff_days !== null && lic.tariff_days !== undefined) {
      const days = Number(lic.tariff_days);
      patch.expires_at = days > 0 ? new Date(now.getTime() + days * 864e5).toISOString() : null;
    }
    // условие .is('activated_at', null) защищает от двойной активации при параллельных запросах
    await sb.from('licenses').update(patch).eq('key_string', key).is('activated_at', null);
    lic = await getLicense(key);
  }

  if (lic.expires_at && new Date(lic.expires_at) < now) {
    return res.json({ valid: false, reason: 'expired', expires_at: lic.expires_at });
  }

  res.json({
    valid: true,
    activated_at: lic.activated_at,
    expires_at: lic.expires_at,
    forever: !lic.expires_at,
  });
}
