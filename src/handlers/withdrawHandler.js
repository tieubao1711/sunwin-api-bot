const { createWithdrawSession } = require('../services/withdrawStore');
const { getWithdrawUrl } = require('../services/withdrawWeb');
const { isAllowedUser, extractAxiosError } = require('../utils/botUtils');
const { escapeHtml, formatNumber } = require('../utils/formatters');

async function handleRutTienCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Bạn không có quyền dùng bot này.');
    return;
  }

  const rawAmount = (match?.[1] || '').trim();
  const amount = rawAmount ? Number(rawAmount.replace(/[,. ]/g, '')) : null;

  if (rawAmount && (!Number.isInteger(amount) || amount <= 0)) {
    await bot.sendMessage(chatId, 'Cách dùng: /ruttien hoặc /ruttien 100000');
    return;
  }

  try {
    const { token } = await createWithdrawSession({
      chatId,
      userId,
      telegramUsername: msg.from.username || '',
      amount
    });
    const url = getWithdrawUrl(token);
    const lines = [
      '<b>Form rút tiền</b>',
      amount ? `Số tiền: <b>${formatNumber(amount)}</b>` : 'Bạn có thể nhập số tiền trong form.',
      'Link có hiệu lực trong 15 phút.'
    ];

    await bot.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Mở form rút tiền', url }]
        ]
      }
    });
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi tạo form rút tiền: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

module.exports = {
  handleRutTienCommand
};
