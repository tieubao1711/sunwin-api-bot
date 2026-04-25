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
const { handleThongKeCommand } = require('./statsHandler');
const {
  handleRutTienCommand,
  handleDanhSachRutCommand
} = require('./withdrawHandler');

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

  bot.onText(/^\/ruttien(?:\s+(.+))?$/, async (msg, match) => {
    await handleRutTienCommand(bot, msg, match);
  });

  bot.onText(/^\/danhsachrut(?:\s+(.+))?$/, async (msg, match) => {
    await handleDanhSachRutCommand(bot, msg, match);
  });

  bot.onText(/^\/thongke(?:\s+(.+))?$/, async (msg, match) => {
    await handleThongKeCommand(bot, msg, match);
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
