import { CURRENCY_BY_LANG, PRICE_TABLE } from '../lib/pricing.js';

export default function handler(req, res) {
  res.json({ currencies: CURRENCY_BY_LANG, prices: PRICE_TABLE });
}
