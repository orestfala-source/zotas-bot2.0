import { getLauncherUrl } from '../lib/launcher.js';

// Обработчик обновлений бота @zontas_bot: /start и кнопка «Завантажити лаунчер»
const API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const TEXTS = {
  uk: {
    hi: 'Привіт! Натисніть кнопку, щоб отримати лаунчер Zontas Visuals.',
    btn: '⬇️ Завантажити лаунчер',
    noAccess: 'Завантаження доступне після покупки з активним ключем.',
    link: 'Посилання дійсне 5 хвилин. Натисніть, щоб завантажити:',
    err: 'Не вдалося отримати посилання. Спробуйте пізніше.',
  },
  ru: {
    hi: 'Привет! Нажмите кнопку, чтобы получить лаунчер Zontas Visuals.',
    btn: '⬇️ Скачать лаунчер',
    noAccess: 'Скачивание доступно после покупки с активным ключом.',
    link: 'Ссылка действует 5 минут. Нажмите, чтобы скачать:',
    err: 'Не удалось получить ссылку. Попробуйте позже.',
  },
  en: {
    hi: 'Hi! Press the button to get the Zontas Visuals launcher.',
    btn: '⬇️ Download launcher',
    noAccess: 'Download is available after a purchase with an active key.',
    link: 'The link is valid for 5 minutes. Tap to download:',
    err: 'Could not get the link. Try again later.',
  },
  pl: {
    hi: 'Cześć! Naciśnij przycisk, aby pobrać launcher Zontas Visuals.',
    btn: '⬇️ Pobierz launcher',
    noAccess: 'Pobieranie jest dostępne po zakupie z aktywnym kluczem.',
    link: 'Link jest ważny przez 5 minut. Kliknij, aby pobrać:',
    err: 'Nie udało się pobrać linku. Spróbuj później.',
  },
};

const pickLang = (code = '') => {
  const c = String(code).slice(0, 2).toLowerCase();
  return TEXTS[c] ? c : 'uk';
};

async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Проверка, что запрос пришёл от Telegram
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).end();
  }

  const update = req.body || {};
  try {
    if (update.message?.text) {
      const msg = update.message;
      const lang = pickLang(msg.from?.language_code);
      if (/^\/(start|launcher)/.test(msg.text)) {
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text: TEXTS[lang].hi,
          reply_markup: { inline_keyboard: [[{ text: TEXTS[lang].btn, callback_data: 'get_launcher' }]] },
        });
      }
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const lang = pickLang(cq.from?.language_code);
      if (cq.data === 'get_launcher') {
        const r = await getLauncherUrl(cq.from.id);
        if (r.url) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id });
          await tg('sendMessage', {
            chat_id: cq.message.chat.id,
            text: `${TEXTS[lang].link}\n${r.url}`,
            disable_web_page_preview: true,
          });
        } else {
          await tg('answerCallbackQuery', {
            callback_query_id: cq.id,
            text: r.reason === 'no_license' ? TEXTS[lang].noAccess : TEXTS[lang].err,
            show_alert: true,
          });
        }
      } else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
      }
    }
  } catch (e) {
    console.error('webhook error', e);
  }
  res.status(200).end();
}
