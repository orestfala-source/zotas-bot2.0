import { verifyInitData, isAdmin } from '../lib/telegram.js';

export default function handler(req, res) {
  const user = verifyInitData(req.body?.initData);
  res.json({ isAdmin: isAdmin(user) });
}
