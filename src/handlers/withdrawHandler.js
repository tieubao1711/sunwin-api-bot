const env = require('../config/env');
const {
  createWithdrawSession,
  listWithdrawOrders
} = require('../services/withdrawStore');
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

  if (!env.withdrawApproverTelegramId) {
    await bot.sendMessage(chatId, 'Chưa cấu hình WITHDRAW_APPROVER_TELEGRAM_ID.');
    return;
  }

  const rawAmount = (match?.[1] || '').trim();
  const amount = rawAmount ? Number(rawAmount.replace(/[,. ]/g, '')) : null;

  if (rawAmount && (!Number.isInteger(amount) || amount <= 0)) {
    await bot.sendMessage(chatId, 'Cách dùng: /ruttien hoặc /ruttien 100000');
    return;
  }

  try {
    const { token, approvalCode } = await createWithdrawSession({
      chatId,
      userId,
      telegramUsername: msg.from.username || '',
      amount
    });
    const url = getWithdrawUrl(token);
    const requester = msg.from.username
      ? `@${msg.from.username}`
      : `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || String(userId);

    await bot.sendMessage(env.withdrawApproverTelegramId, [
      '<b>Mã xác thực rút tiền</b>',
      `Mã: <code>${approvalCode}</code>`,
      `Người yêu cầu: ${escapeHtml(requester)} (<code>${userId}</code>)`,
      amount ? `Số tiền yêu cầu: <b>${formatNumber(amount)}</b>` : 'Số tiền: người dùng nhập trong form',
      'Chỉ cung cấp mã này nếu bạn đồng ý cho tạo lệnh rút.'
    ].join('\n'), {
      parse_mode: 'HTML'
    });

    const lines = [
      '<b>Form rút tiền</b>',
      amount ? `Số tiền: <b>${formatNumber(amount)}</b>` : 'Bạn có thể nhập số tiền trong form.',
      'Mã xác thực đã được gửi cho người duyệt. Bạn cần nhập đúng mã đó trong form.',
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

async function handleDanhSachRutCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Bạn không có quyền dùng bot này.');
    return;
  }

  const arg = (match?.[1] || '').trim().toLowerCase();
  const onlyMine = arg === 'mine' || arg === 'me';

  try {
    const orders = await listWithdrawOrders({
      limit: 10,
      userId: onlyMine ? userId : undefined
    });

    if (!orders.length) {
      await bot.sendMessage(chatId, onlyMine ? 'Bạn chưa có lệnh rút nào.' : 'Chưa có lệnh rút nào.');
      return;
    }

    await bot.sendMessage(chatId, buildWithdrawListMessage(orders, onlyMine), {
      parse_mode: 'HTML'
    });
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi lấy danh sách rút tiền: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

function buildWithdrawListMessage(orders, onlyMine) {
  const lines = [
    `<b>Danh sách rút tiền gần nhất${onlyMine ? ' của bạn' : ''}</b>`
  ];

  orders.forEach((order, index) => {
    lines.push('');
    lines.push(`<b>${index + 1}. ${escapeHtml(order.status || '-')}</b> • <b>${formatNumber(order.amount)}</b>`);
    lines.push(`Ngân hàng: ${escapeHtml(order.bankName || order.bankCode || '-')}`);
    lines.push(`STK: <code>${escapeHtml(maskAccount(order.bankAccount))}</code>`);
    lines.push(`Tên TK: ${escapeHtml(order.bankAccountName || '-')}`);
    lines.push(`Mã lệnh: <code>${escapeHtml(order.requestId || '-')}</code>`);
    lines.push(`Thời gian: ${escapeHtml(formatVietnamDateTime(order.createdAt))}`);
  });

  lines.push('');
  lines.push('Dùng <code>/danhsachrut mine</code> để chỉ xem lệnh của bạn.');
  return lines.join('\n');
}

function maskAccount(value) {
  const text = String(value || '');
  if (text.length <= 4) return text || '-';
  return `${'*'.repeat(Math.max(text.length - 4, 0))}${text.slice(-4)}`;
}

function formatVietnamDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

module.exports = {
  handleRutTienCommand,
  handleDanhSachRutCommand
};
