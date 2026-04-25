const { sendUsage } = require('./usageHandler');
const {
  handleInfoCommand,
  handleAccountCallback,
  handleAccountTextMessage
} = require('./accountHandler');
const {
  handleNapTienCommand,
  handleRechargeCallbackQuery
} = require('./rechargeHandler');

function registerBot(bot) {
  bot.onText(/^\/start$/, async (msg) => {
    await sendUsage(bot, msg.chat.id);
  });

  bot.onText(/^\/help$/, async (msg) => {
    await sendUsage(bot, msg.chat.id);
  });

  bot.onText(/^\/info(?:\s+(.+))?$/, async (msg, match) => {
    await handleInfoCommand(bot, msg, match);
  });

  bot.onText(/^\/naptien(?:\s+(.+))?$/, async (msg, match) => {
    await handleNapTienCommand(bot, msg, match);
  });

  bot.on('callback_query', async (query) => {
    if (await handleRechargeCallbackQuery(bot, query)) return;
    await handleAccountCallback(bot, query);
  });

  bot.on('message', async (msg) => {
    if (!msg.text) return;
    await handleAccountTextMessage(bot, msg);
  });
}

module.exports = { registerBot };
