import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = process.env.LAUNCHER_BUCKET || 'launcher';
const FILE = process.env.LAUNCHER_FILE || 'ZontasLauncher.exe';

// Есть ли у аккаунта оплаченный ключ, который ещё не истёк
export async function hasActiveLicense(tgId) {
  const { data, error } = await sb
    .from('licenses')
    .select('expires_at')
    .eq('tg_id', tgId)
    .eq('source', 'payment')
    .eq('status', 'active');
  if (error) throw error;
  const now = Date.now();
  return (data || []).some(k => !k.expires_at || new Date(k.expires_at).getTime() > now);
}

// Временная ссылка на лаунчер (5 минут) только для владельцев ключа
export async function getLauncherUrl(tgId) {
  if (!(await hasActiveLicense(tgId))) return { reason: 'no_license' };
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(FILE, 300, { download: FILE });
  if (error || !data) return { reason: 'error' };
  return { url: data.signedUrl };
}
