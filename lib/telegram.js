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
  const ids = (process.env.ADMIN_TG_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const names = (process.env.ADMIN_USERNAMES || 'orest6752').split(',').map(normalize).filter(Boolean);
  return ids.includes(String(user.id)) || (!!user.username && names.includes(normalize(user.username)));
}
