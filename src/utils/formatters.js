const { getBankNameById } = require('./bankEnum');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  const prefix = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${prefix}${formatNumber(Math.abs(num))}`;
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const ms = String(value).length === 10 ? Number(value) * 1000 : Number(value);
  const date = new Date(ms);

  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getWallet(payload) {
  return (
    payload?.walletInfo?.wallet ||
    payload?.walletInfo?.wallet?.wallet ||
    payload?.walletInfo?.walletInfo?.wallet ||
    payload?.walletInfo?.wsMeta?.As ||
    {}
  );
}

function normalizeSlipItems(response) {
  return response?.data?.data?.items || response?.data?.items || response?.items || [];
}

function buildBasicInfoMessage(payload) {
  const profile = payload?.profile || {};
  const wallet = getWallet(payload);

  return [
    '👤 <b>THÔNG TIN TÀI KHOẢN</b>',
    `• Username: <code>${escapeHtml(profile.username || '')}</code>`,
    `• Display name: ${escapeHtml(profile.displayName || '-')}`,
    `• Phone: <code>${escapeHtml(profile.phone || '-')}</code>`,
    `• Email: <code>${escapeHtml(profile.email || '-')}</code>`,
    '',
    '💰 <b>SỐ DƯ</b>',
    `• Gold: <b>${formatNumber(wallet.gold)}</b>`,
    `• Chip: <b>${formatNumber(wallet.chip)}</b>`,
    `• Safe: <b>${formatNumber(wallet.safe)}</b>`,
    `• VIP: <b>${formatNumber(wallet.vip)}</b>`
  ].join('\n');
}

function buildTransactionsMessage(apiResponse) {
  const items = apiResponse?.data?.items || apiResponse?.items || [];

  if (!items.length) {
    return '🎮 <b>LỊCH SỬ CƯỢC</b>\nKhông có dữ liệu gần đây.';
  }

  const lines = ['🎮 <b>LỊCH SỬ CƯỢC GẦN NHẤT</b>'];

  items.slice(0, 5).forEach((item, index) => {
    const amount = Number(item.exchangeValue || 0);
    const amountText = formatMoney(amount);
    const amountIcon = amount > 0 ? '🟢' : amount < 0 ? '🔴' : '⚪';

    lines.push('');
    lines.push(`<b>${index + 1}.</b> ${escapeHtml(item.serviceName || 'Không rõ')}`);
    lines.push(`• ${escapeHtml(formatTimestamp(item.createdTime))}`);
    lines.push(`• ${escapeHtml(item.description || '')}`);
    lines.push(`• Biến động: ${amountIcon} <b>${amountText}</b>`);
    lines.push(`• Số dư cuối: <b>${formatNumber(item.closingValue)}</b>`);
  });

  return lines.join('\n');
}

function buildDepositHistoryMessage(apiResponse) {
  const items = normalizeSlipItems(apiResponse);

  if (!items.length) {
    return '🏦 <b>LỊCH SỬ NẠP GẦN NHẤT</b>\nKhông có dữ liệu.';
  }

  const lines = ['🏦 <b>LỊCH SỬ NẠP GẦN NHẤT</b>'];

  items.slice(0, 5).forEach((item, index) => {
    const bankReceive = item.bankReceive || {};
    const bankName = getBankNameById(bankReceive.bankId) || 'Không rõ';
    const amount = formatNumber(item.amount);
    const time = formatTimestamp(item.requestTime);
    const status = item.statusDescription || 'Không rõ';

    lines.push('');
    lines.push(`<b>${index + 1}.</b> ${escapeHtml(bankName)} • <b>${amount}</b>`);
    lines.push(`• ${escapeHtml(time)}`);
    lines.push(`• ${escapeHtml(status)}`);
  });

  return lines.join('\n');
}

function buildWithdrawHistoryMessage(apiResponse) {
  const items = normalizeSlipItems(apiResponse);

  if (!items.length) {
    return '💸 <b>LỊCH SỬ RÚT GẦN NHẤT</b>\nKhông có dữ liệu.';
  }

  const lines = ['💸 <b>LỊCH SỬ RÚT GẦN NHẤT</b>'];

  items.slice(0, 5).forEach((item, index) => {
    const bankReceive = item.bankReceive || {};
    const bankName = getBankNameById(bankReceive.bankId) || 'Không rõ';
    const accountNumber = bankReceive.accountNumber || '-';
    const accountName = bankReceive.accountName || '-';
    const amount = formatNumber(item.amount);
    const time = formatTimestamp(item.requestTime);
    const status = item.statusDescription || 'Không rõ';

    lines.push('');
    lines.push(`<b>${index + 1}.</b> ${escapeHtml(bankName)} • <b>${amount}</b>`);
    lines.push(`• STK: <code>${escapeHtml(accountNumber)}</code>`);
    lines.push(`• Tên TK: ${escapeHtml(accountName)}`);
    lines.push(`• ${escapeHtml(time)}`);
    lines.push(`• ${escapeHtml(status)}`);
  });

  return lines.join('\n');
}

module.exports = {
  buildBasicInfoMessage,
  buildTransactionsMessage,
  buildDepositHistoryMessage,
  buildWithdrawHistoryMessage,
  escapeHtml,
  formatNumber
};
