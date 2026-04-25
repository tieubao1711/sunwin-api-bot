const crypto = require('crypto');
const env = require('../config/env');
const {
  fetchAvailableBanks,
  createBankRecharge
} = require('../services/rechargeApiClient');
const {
  createRechargeOrder,
  getRechargeOrder,
  markBankSelected
} = require('../services/rechargeStore');
const { getCallbackUrl } = require('../services/callbackServer');
const { escapeHtml } = require('../utils/formatters');
const {
  isAllowedUser,
  extractAxiosError
} = require('../utils/botUtils');

const RECHARGE_BANK_PREFIX = 'recharge_bank:';

function createRequestId() {
  return `dep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeBanks(apiResponse) {
  return apiResponse?.data || [];
}

function formatRechargeAmount(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
}

function buildBankKeyboard(requestId, banks) {
  const rows = banks.map((bank) => [
    {
      text: bank.name || bank.code,
      callback_data: `${RECHARGE_BANK_PREFIX}${requestId}:${bank.code}`
    }
  ]);

  return { inline_keyboard: rows };
}

function buildRechargeInfoMessage(order) {
  const data = order.rechargeData || {};

  return [
    '<b>Thông tin xác minh</b>',
    `Ngân hàng: <b>${escapeHtml(data.bank_provider || order.selectedBank?.name || order.selectedBank?.code || '-')}</b>`,
    `Số TK: <code>${escapeHtml(data.phoneNum || '-')}</code>`,
    `Người nhận: <b>${escapeHtml(data.phoneName || '-')}</b>`,
    `Số tiền: <b>${formatRechargeAmount(data.amount || order.amount)}</b>`,
    `Nội dung: <code>${escapeHtml(data.code || order.requestId)}</code>`,
    '',
    'Vui lòng chuyển đúng số tiền và nội dung. Bot sẽ tự báo khi callback thành công.'
  ].join('\n');
}

async function handleNapTienCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Bạn không có quyền dùng bot này.');
    return;
  }

  if (!env.rechargeApiKey) {
    await bot.sendMessage(chatId, 'Chưa cấu hình RECHARGE_API_KEY.');
    return;
  }

  const amount = Number((match?.[1] || '').trim());
  if (!Number.isInteger(amount) || amount <= 0) {
    await bot.sendMessage(chatId, 'Cách dùng: /naptien 50000');
    return;
  }

  await bot.sendMessage(chatId, 'Đang lấy danh sách ngân hàng...');

  try {
    const bankResponse = await fetchAvailableBanks();
    if (bankResponse?.stt !== 1) {
      await bot.sendMessage(chatId, `Không lấy được danh sách bank: ${escapeHtml(bankResponse?.msg || 'unknown')}`, {
        parse_mode: 'HTML'
      });
      return;
    }

    const banks = normalizeBanks(bankResponse);
    if (!banks.length) {
      await bot.sendMessage(chatId, 'Hiện không có ngân hàng khả dụng.');
      return;
    }

    const requestId = createRequestId();
    await createRechargeOrder({
      requestId,
      chatId,
      userId,
      telegramUsername: msg.from.username || '',
      memberIdentity: String(userId),
      amount,
      bankOptions: banks
    });

    await bot.sendMessage(
      chatId,
      `Chọn ngân hàng để nạp <b>${formatRechargeAmount(amount)}</b>:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildBankKeyboard(requestId, banks)
      }
    );
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi tạo lệnh nạp: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

async function handleRechargeCallbackQuery(bot, query) {
  if (!query.data?.startsWith(RECHARGE_BANK_PREFIX)) return false;

  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const [, requestId, bankCode] = query.data.split(':');

  const order = await getRechargeOrder(requestId);
  if (!order || order.chatId !== chatId || order.userId !== userId) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Lệnh nạp không hợp lệ hoặc đã hết hạn.'
    });
    return true;
  }

  const bank = (order.bankOptions || []).find((item) => item.code === bankCode);
  if (!bank) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Bank không hợp lệ.'
    });
    return true;
  }

  await bot.answerCallbackQuery(query.id, {
    text: 'Đang tạo thông tin chuyển khoản...'
  });

  try {
    const response = await createBankRecharge({
      amount: order.amount,
      memberIdentity: order.memberIdentity,
      requestId: order.requestId,
      bankCode: bank.code,
      callbackUrl: getCallbackUrl()
    });

    if (response?.stt !== 1) {
      await bot.sendMessage(chatId, `Tạo lệnh nạp thất bại: ${escapeHtml(response?.msg || 'unknown')}`, {
        parse_mode: 'HTML'
      });
      return true;
    }

    const updatedOrder = await markBankSelected(order.requestId, bank, response);
    const message = buildRechargeInfoMessage(updatedOrder);
    const qrUrl = updatedOrder.rechargeData?.qr_url;

    if (qrUrl) {
      await bot.sendPhoto(chatId, qrUrl, {
        caption: message,
        parse_mode: 'HTML'
      });
      return true;
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi tạo QR nạp tiền: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }

  return true;
}

module.exports = {
  handleNapTienCommand,
  handleRechargeCallbackQuery
};
