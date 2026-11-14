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
// Будь-який активний ключ акаунта сайту
export async function accountHasLicense(acc) {
  const { data, error } = await sb.from('licenses').select('expires_at')
    .or(`user_id.eq.${acc.uid},email.eq.${acc.email.replace(/[,()]/g, '')}`).eq('status', 'active');
  if (error) throw error;
  const now = Date.now();
  return (data || []).some(k => !k.expires_at || new Date(k.expires_at).getTime() > now);
}

export async function getLauncherUrl(tgId, acc) {
  // лаунчер викладено за прямим посиланням — віддаємо всім (без ключа візуали все одно не запрацюють)
  if (process.env.LAUNCHER_URL) return { url: process.env.LAUNCHER_URL };
  const ok = (tgId && await hasActiveLicense(tgId)) || (acc && acc.uid && await accountHasLicense(acc));
  if (!ok) return { reason: 'no_license' };
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(FILE, 300, { download: FILE });
  if (error || !data) return { reason: 'error' };
  return { url: data.signedUrl };
}
