import { verifyInitData } from '../lib/telegram.js';
import { getLauncherUrl } from '../lib/launcher.js';

// Скачивание с сайта (Mini App)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ reason: 'unauthorized' });
  try {
    const r = await getLauncherUrl(user.id);
    if (r.reason) return res.status(r.reason === 'no_license' ? 403 : 500).json({ reason: r.reason });
    res.json({ url: r.url });
  } catch {
    res.status(500).json({ reason: 'error' });
  }
}
