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
    `Username: <code>${escapeHtml(item.username || '-')}</code>`,
    `Display name: <b>${escapeHtml(item.displayName || '-')}</b>`,
    `Phone: <code>${escapeHtml(item.phone || '-')}</code>`,
    `So du: <b>${formatNumber(item.balance)}</b>`,
    '',
    '<b>TONG KET</b>',
    `Tong nap: <b>${formatNumber(item.totalDeposit)}</b> (${formatNumber(item.depositCount)} lenh)`,
    `Tong rut: <b>${formatNumber(item.totalWithdraw)}</b> (${formatNumber(item.withdrawCount)} lenh)`,
    `May quet: <code>${escapeHtml(item.machineId || item.toolName || '-')}</code>`,
    `Cap nhat: ${escapeHtml(formatDateTime(item.checkedAt || item.updatedAt || item.createdAt))}`
  ];

  lines.push('');
  lines.push('<b>NAP GAN NHAT</b>');
  if (!deposits.length) {
    lines.push('Khong co du lieu nap.');
  } else {
    deposits.slice(0, 5).forEach((deposit, index) => {
      lines.push('');
      lines.push(`${index + 1}. <b>${formatNumber(deposit.amount)}</b> - ${escapeHtml(deposit.statusDescription || '-')}`);
      lines.push(`Ma GD: <code>${escapeHtml(deposit.transactionCode || deposit.id || '-')}</code>`);
      lines.push(`Thoi gian: ${escapeHtml(formatDateTime(deposit.requestTime))}`);
      lines.push(`Nhan: ${escapeHtml(deposit.bankReceive?.accountName || '-')} - <code>${escapeHtml(deposit.bankReceive?.accountNumber || '-')}</code>`);
    });
  }

  if (withdraws.length) {
    lines.push('');
    lines.push(`<b>RUT GAN NHAT</b>: ${formatNumber(withdraws.length)} lenh`);
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
