import crypto from 'crypto';

// Токени ботів, яким можна вірити: основний + (необовʼязково) ще кілька через кому.
// trim() — часта причина поломки: зайвий пробіл або перенос рядка в змінній Vercel.
function botTokens() {
  return [process.env.TELEGRAM_BOT_TOKEN, ...(process.env.TELEGRAM_BOT_TOKENS || '').split(',')]
    .map(t => String(t || '').trim()).filter(Boolean);
}

function checkHash(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  return calc.length === hash.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

export function verifyInitData(initData) {
  if (!initData) return null;
  for (const token of botTokens()) {
    try {
      if (checkHash(initData, token)) return JSON.parse(new URLSearchParams(initData).get('user') || 'null');
    } catch {}
  }
  return null;
}

/** Діагностика міні-апки: що саме не так з підписом (без секретів). */
export function diagnoseInitData(initData) {
  const tokens = botTokens();
  const p = new URLSearchParams(initData || '');
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null'); } catch {}
  const authDate = Number(p.get('auth_date')) || 0;
  return {
    env_token_set: tokens.length > 0,
    env_bot_ids: tokens.map(t => t.split(':')[0]),           // публічний id бота, не секрет
    init_data_present: !!initData,
    has_hash: !!p.get('hash'),
    user_id: user ? user.id : null,
    username: user ? user.username || null : null,
    auth_age_min: authDate ? Math.round((Date.now() / 1000 - authDate) / 60) : null,
    signature_ok: !!(initData && tokens.some(t => { try { return checkHash(initData, t); } catch { return false; } })),
  };
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
