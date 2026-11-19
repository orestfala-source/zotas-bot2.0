import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegram.js';

// Покупець: або Telegram (initData міні-апки), або акаунт сайту (пошта + пароль, Supabase Auth)
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function accountFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return { uid: data.user.id, email: (data.user.email || '').toLowerCase() };
  } catch {
    return null;
  }
}

/** { kind: 'tg', tg } | { kind: 'account', uid, email } | null */
export async function resolveBuyer(body) {
  const tg = verifyInitData(body?.initData);
  const acc = await accountFromToken(body?.accessToken);
  // у міні-апці Telegram можна ще й увійти в акаунт — тоді є обидва
  if (tg) return { kind: 'tg', tg, ...(acc || {}) };
  if (acc) return { kind: 'account', ...acc };
  return null;
}

/** Ключі акаунта: привʼязані до нього або видані адміном на його пошту */
export function accountKeysQuery(query, acc) {
  return query.or(`user_id.eq.${acc.uid},email.eq.${acc.email.replace(/[,()]/g, '')}`);
}
