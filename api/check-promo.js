import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.json({ valid: false });
  const { data } = await sb
    .from('promo_codes').select('code, discount_percent, active')
    .eq('code', code).maybeSingle();
  if (!data || !data.active) return res.json({ valid: false });
  res.json({ valid: true, code: data.code, discount_percent: data.discount_percent });
}
