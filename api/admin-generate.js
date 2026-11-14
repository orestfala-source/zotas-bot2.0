import { createClient } from '@supabase/supabase-js';
import { resolveUser, isAdmin, issueAdminToken } from '../lib/telegram.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VALID_DAYS = [30, 60, 90, 180, 0];

function generateKey(prefix = 'ZV') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${seg()}-${seg()}-${seg()}`;
}

const LIST_FIELDS = 'key_string, status, source, channel, tariff_days, activated_at, expires_at, created_at, tg_username, email, issued_by, amount, promo_code, zv_hwid';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

/**
 * Адмін-панель (одна функція, бо в папці api максимум 12 файлів).
 * action: login | generate (за замовчуванням) | list | update
 * Доступ: Telegram-адмін (initData) або веб-адмін (adminToken після login).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  const action = String(body.action || 'generate');

  if (action === 'login') {
    // невелика затримка проти перебору пароля
    await new Promise(r => setTimeout(r, 600));
    const token = issueAdminToken(body.password);
    if (!token) return res.status(401).json({ error: 'wrong_password' });
    return res.json({ token });
  }

  const user = resolveUser(body);
  if (!isAdmin(user)) return res.status(403).json({ error: 'Нет доступа' });
  const issuer = user.username || String(user.id);

  if (action === 'list') return list(body, res);
  if (action === 'update') return update(body, res, issuer);
  return generate(body, res, issuer);
}

async function generate(body, res, issuer) {
  const raw = body.tariffId;
  const isBeta = raw === 'beta';
  const days = isBeta ? 0 : Number(raw);
  if (!isBeta && !VALID_DAYS.includes(days)) return res.status(400).json({ error: 'Неизвестный тариф' });

  // кому видаємо ключ (Telegram username без @), необов'язково
  // кому: @telegram або пошта акаунта сайту
  const rawFor = String(body.forUsername || '').trim();
  const forEmail = EMAIL_RE.test(rawFor) ? rawFor.toLowerCase() : null;
  const forUser = forEmail ? '' : rawFor.replace(/^@/, '');
  if (forUser && !/^[A-Za-z0-9_]{3,32}$/.test(forUser)) return res.status(400).json({ error: 'Невірний username або пошта' });

  const count = Math.min(50, Math.max(1, Number(body.count) || 1));
  const rows = Array.from({ length: count }, () => ({
    key_string: generateKey(isBeta ? 'ZB' : 'ZV'),
    status: 'active',
    source: 'admin',
    channel: isBeta ? 'beta' : 'stable',
    tariff_days: days,
    expires_at: null,          // срок почнеться при активації ключа
    activated_at: null,
    tg_username: forUser || null,
    email: forEmail,
    issued_by: issuer,
  }));
  const { error } = await sb.from('licenses').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  const keys = rows.map(r => r.key_string);
  res.json({ key: keys[0], keys, for_username: forUser || forEmail || null });
}

async function list(body, res) {
  const q = String(body.q || '').trim().replace(/^@/, '');
  const filter = String(body.filter || 'all');
  let query = sb.from('licenses').select(LIST_FIELDS).order('created_at', { ascending: false }).limit(100);
  if (q) {
    const safe = q.replace(/[%,()]/g, '');
    query = query.or(`key_string.ilike.%${safe}%,tg_username.ilike.%${safe}%,email.ilike.%${safe}%,promo_code.ilike.%${safe}%`);
  }
  const nowIso = new Date().toISOString();
  if (filter === 'active') query = query.eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (filter === 'expired') query = query.lt('expires_at', nowIso);
  if (filter === 'admin') query = query.eq('source', 'admin');
  if (filter === 'payment') query = query.eq('source', 'payment');
  if (filter === 'revoked') query = query.neq('status', 'active');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rows: data || [] });
}

async function update(body, res, issuer) {
  const key = String(body.key || '').trim().toUpperCase();
  const op = String(body.op || '');
  if (!key) return res.status(400).json({ error: 'no_key' });
  const { data: lic, error: gErr } = await sb.from('licenses').select(LIST_FIELDS).eq('key_string', key).maybeSingle();
  if (gErr) return res.status(500).json({ error: gErr.message });
  if (!lic) return res.status(404).json({ error: 'not_found' });

  let patch;
  if (op === 'revoke') patch = { status: 'revoked' };
  else if (op === 'restore') patch = { status: 'active' };
  else if (op === 'reset_hwid') patch = { zv_hwid: null, hwid_at: null };
  else if (op === 'forever') patch = { expires_at: null, tariff_days: 0, status: 'active' };
  else if (op === 'extend') {
    const days = Math.min(3650, Math.max(1, Number(body.days) || 0));
    if (!lic.activated_at) {
      // ще не активований: просто збільшуємо строк, відлік почнеться з активації
      patch = { tariff_days: (Number(lic.tariff_days) || 0) + days };
      if (Number(lic.tariff_days) === 0) patch = {}; // вже безстроковий
    } else {
      if (!lic.expires_at) return res.json({ ok: true, row: lic }); // безстроковий
      const from = Math.max(Date.now(), new Date(lic.expires_at).getTime());
      patch = { expires_at: new Date(from + days * 864e5).toISOString(), status: 'active' };
    }
  } else if (op === 'assign') {
    const raw = String(body.username || '').trim();
    if (EMAIL_RE.test(raw)) patch = { email: raw.toLowerCase() };
    else {
      const u = raw.replace(/^@/, '');
      if (u && !/^[A-Za-z0-9_]{3,32}$/.test(u)) return res.status(400).json({ error: 'Невірний username або пошта' });
      patch = { tg_username: u || null };
    }
  } else {
    return res.status(400).json({ error: 'bad_op' });
  }
  if (Object.keys(patch).length) {
    const { error } = await sb.from('licenses').update(patch).eq('key_string', key);
    if (error) return res.status(500).json({ error: error.message });
  }
  const { data: row } = await sb.from('licenses').select(LIST_FIELDS).eq('key_string', key).maybeSingle();
  res.json({ ok: true, row, by: issuer });
}
