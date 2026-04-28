const { fetchLatestHistory } = require('../services/historyApiClient');
const {
  escapeHtml,
  formatNumber
} = require('../utils/formatters');
const { isAllowedUser, extractAxiosError } = require('../utils/botUtils');

async function handleHistoryCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Ban khong co quyen dung bot nay.');
    return;
  }

  const credentials = parseHistoryCredentials(match?.[1] || '');
  if (!credentials) {
    await bot.sendMessage(
      chatId,
      [
        'Cach dung:',
        '/history username|password',
        '/history username password'
      ].join('\n')
    );
    return;
  }

  await bot.sendMessage(chatId, 'Dang lay lich su moi nhat...');

  try {
    const response = await fetchLatestHistory(credentials.username, credentials.password);
    if (!response?.found || !response?.item) {
      await bot.sendMessage(chatId, 'Khong tim thay lich su cho tai khoan nay.');
      return;
    }

    await bot.sendMessage(chatId, buildHistoryMessage(response.item), {
      parse_mode: 'HTML'
    });
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `<b>Lay lich su that bai</b>\n<code>${escapeHtml(extractAxiosError(error))}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

function parseHistoryCredentials(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (raw.includes('|')) {
    const [username, ...passwordParts] = raw.split('|');
    const password = passwordParts.join('|');
    if (!username.trim() || !password.trim()) return null;
    return {
      username: username.trim(),
      password: password.trim()
    };
  }

  const args = raw.split(/\s+/).filter(Boolean);
  if (args.length < 2) return null;

  return {
    username: args[0],
    password: args.slice(1).join(' ')
  };
}

function buildHistoryMessage(item) {
  const deposits = Array.isArray(item.deposits) ? item.deposits : [];
  const withdraws = Array.isArray(item.withdraws) ? item.withdraws : [];
  const lines = [
    '<b>LICH SU TAI KHOAN</b>',
    `<code>${escapeHtml(item.username || '-')}</code> - <b>${escapeHtml(item.displayName || '-')}</b>`,
    `Phone: <code>${escapeHtml(item.phone || '-')}</code>`,
    `So du: <b>${formatNumber(item.balance)}</b>`,
    '',
    `<b>Nap:</b> ${formatNumber(item.totalDeposit)} (${formatNumber(item.depositCount)} lenh)`,
    `<b>Rut:</b> ${formatNumber(item.totalWithdraw)} (${formatNumber(item.withdrawCount)} lenh)`,
    `<b>Cap nhat:</b> ${escapeHtml(formatDateTime(item.checkedAt || item.updatedAt || item.createdAt))}`
  ];

  lines.push('');
  lines.push('<b>NAP GAN NHAT</b>');
  if (!deposits.length) {
    lines.push('Khong co du lieu nap.');
  } else {
    deposits.slice(0, 5).forEach((deposit, index) => {
      lines.push(`${index + 1}. <b>${formatNumber(deposit.amount)}</b> - ${escapeHtml(deposit.statusDescription || '-')}`);
    });
  }

  lines.push('');
  lines.push('<b>RUT GAN NHAT</b>');
  if (!withdraws.length) {
    lines.push('Khong co du lieu rut.');
  } else {
    withdraws.slice(0, 5).forEach((withdraw, index) => {
      lines.push('');
      lines.push(`${index + 1}. <b>${formatNumber(withdraw.amount)}</b> - ${escapeHtml(withdraw.statusDescription || '-')}`);
      lines.push(`Ma GD: <code>${escapeHtml(withdraw.transactionCode || withdraw.id || '-')}</code>`);
      lines.push(`Thoi gian: ${escapeHtml(formatDateTime(withdraw.requestTime))}`);
      lines.push(`Nhan: ${escapeHtml(withdraw.bankReceive?.accountName || '-')} - <code>${escapeHtml(withdraw.bankReceive?.accountNumber || '-')}</code>`);
    });
  }

  return lines.join('\n');
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Saigon',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

module.exports = { handleHistoryCommand };
