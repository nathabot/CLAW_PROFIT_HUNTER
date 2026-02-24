/**
 * Notify when shadowban is lifted
 */
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '428798235';

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

bot.sendMessage(CHAT_ID, '🎉 SHADOWBAN TELAH CABUT!\n\nTwitter automation @daiarticle siap lagi!')
  .then(() => console.log('Notification sent!'))
  .catch(e => console.error('Failed:', e.message));
