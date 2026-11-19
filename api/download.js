import { resolveBuyer } from '../lib/account.js';
import { getLauncherUrl } from '../lib/launcher.js';

// Скачивание с сайта (Mini App)
export default async function handler(req, res) {
  // Автооновлення лаунчера: /update/<файл> → LAUNCHER_UPDATE_BASE/<файл> (див. vercel.json)
  if (req.method === 'GET' && req.query && req.query.update) {
    const file = String(req.query.update);
    const base = (process.env.LAUNCHER_UPDATE_BASE || '').replace(/\/+$/, '');
    if (!base) return res.status(404).json({ reason: 'updates_not_configured' });
    if (!/^(latest\.yml|ZontasLauncher\.exe|ZontasLauncher\.exe\.blockmap)$/.test(file)) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(302, { Location: `${base}/${file}` });
    return res.end();
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (process.env.LAUNCHER_URL) return res.json({ url: process.env.LAUNCHER_URL });
  const buyer = await resolveBuyer(req.body);
  if (!buyer) return res.status(401).json({ reason: 'unauthorized' });
  try {
    const r = await getLauncherUrl(buyer.tg ? buyer.tg.id : null, buyer.uid ? buyer : null);
    if (r.reason) return res.status(r.reason === 'no_license' ? 403 : 500).json({ reason: r.reason });
    res.json({ url: r.url });
  } catch {
    res.status(500).json({ reason: 'error' });
  }
}
