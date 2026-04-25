const TelegramBot = require('node-telegram-bot-api');
const env = require('./config/env');
const { registerBot } = require('./handlers/botHandler');
const { connectMongo } = require('./db/mongo');
const { startRechargeCallbackServer } = require('./services/callbackServer');

if (!env.telegramBotToken) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in environment variables');
}

const bot = new TelegramBot(env.telegramBotToken, { polling: true });

connectMongo()
  .then(() => {
    registerBot(bot);
    startRechargeCallbackServer(bot);
    console.log('Telegram account bot started');
  })
  .catch((error) => {
    console.error('[startup_error]', error?.message || error);
    process.exit(1);
  });

bot.on('polling_error', (error) => {
  console.error('[polling_error]', error?.message || error);
});
