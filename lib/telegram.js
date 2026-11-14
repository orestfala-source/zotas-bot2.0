import crypto from 'crypto';

export function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN || '').digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  return JSON.parse(params.get('user') || 'null');
}

const normalize = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

export function isAdmin(user) {
  if (!user) return false;
  if (user.webAdmin) return true;
  const ids = (process.env.ADMIN_TG_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  // адміни з коду + додаткові зі змінної ADMIN_USERNAMES у Vercel
  const names = ['orest6752', 'sweech_hvh', 'darspecter_25', ...(process.env.ADMIN_USERNAMES || '').split(',')].map(normalize).filter(Boolean);
  return ids.includes(String(user.id)) || (!!user.username && names.includes(normalize(user.username)));
}

/* ---------- Веб-адмінка (вхід на сайті без Telegram) ----------
 * Пароль задається змінною ADMIN_PASSWORD у Vercel. Після входу браузер отримує
 * підписаний токен на 12 годин (HMAC від пароля), сам пароль ніде не зберігається. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function tokenSig(exp) {
  return crypto.createHmac('sha256', String(process.env.ADMIN_PASSWORD || '')).update(`zv-admin|${exp}`).digest('hex');
}

export function issueAdminToken(password) {
  const real = String(process.env.ADMIN_PASSWORD || '');
  if (real.length < 8) return null; // веб-вхід вимкнено, поки пароль не задано
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  if (!crypto.timingSafeEqual(a, b)) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${tokenSig(exp)}`;
}

export function verifyAdminToken(token) {
  if (!token || String(process.env.ADMIN_PASSWORD || '').length < 8) return false;
  const [expStr, sig] = String(token).split('.');
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const calc = tokenSig(exp);
  return calc.length === sig.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(sig));
}

/** Користувач запиту: Telegram (initData) або веб-адмін (adminToken). */
export function resolveUser(body) {
  const tgUser = verifyInitData(body?.initData);
  if (tgUser) return tgUser;
  if (verifyAdminToken(body?.adminToken)) return { id: 'web', username: 'web-admin', webAdmin: true };
  return null;
}
