const { getRechargeStats } = require('../services/rechargeStore');
const { escapeHtml, formatNumber } = require('../utils/formatters');
const { isAllowedUser, extractAxiosError } = require('../utils/botUtils');

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function getVietnamDateParts(date) {
  const local = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate(),
    day: local.getUTCDay()
  };
}

function vietnamLocalToUtcDate(year, month, date) {
  return new Date(Date.UTC(year, month, date) - VIETNAM_OFFSET_MS);
}

function getStatsRange(period) {
  const now = new Date();
  const parts = getVietnamDateParts(now);

  if (period === 'week') {
    const mondayOffset = parts.day === 0 ? -6 : 1 - parts.day;
    const start = vietnamLocalToUtcDate(parts.year, parts.month, parts.date + mondayOffset);
    const end = vietnamLocalToUtcDate(parts.year, parts.month, parts.date + mondayOffset + 7);
    return {
      label: 'tuần này',
      start,
      end
    };
  }

  if (period === 'month') {
    const start = vietnamLocalToUtcDate(parts.year, parts.month, 1);
    const end = vietnamLocalToUtcDate(parts.year, parts.month + 1, 1);
    return {
      label: 'tháng này',
      start,
      end
    };
  }

  const start = vietnamLocalToUtcDate(parts.year, parts.month, parts.date);
  const end = vietnamLocalToUtcDate(parts.year, parts.month, parts.date + 1);
  return {
    label: 'hôm nay',
    start,
    end
  };
}

function formatVietnamDateTime(date) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function buildStatsMessage(range, stats) {
  const lines = [
    `📊 <b>Thống kê doanh thu ${escapeHtml(range.label)}</b>`,
    `Từ: <code>${escapeHtml(formatVietnamDateTime(range.start))}</code>`,
    `Đến: <code>${escapeHtml(formatVietnamDateTime(range.end))}</code>`,
    '',
    `Tổng doanh thu: <b>${formatNumber(stats.totalAmount)}</b>`,
    `Số lệnh thành công: <b>${formatNumber(stats.totalOrders)}</b>`
  ];

  if (stats.byBank.length) {
    lines.push('');
    lines.push('<b>Theo ngân hàng</b>');
    stats.byBank.slice(0, 10).forEach((item, index) => {
      lines.push(
        `${index + 1}. ${escapeHtml(item.bank)}: <b>${formatNumber(item.totalAmount)}</b> (${formatNumber(item.totalOrders)} lệnh)`
      );
    });
  }

  return lines.join('\n');
}

async function handleThongKeCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Bạn không có quyền dùng bot này.');
    return;
  }

  const period = (match?.[1] || '').trim().toLowerCase();
  if (period && !['week', 'month'].includes(period)) {
    await bot.sendMessage(chatId, 'Cách dùng: /thongke, /thongke week hoặc /thongke month');
    return;
  }

  const range = getStatsRange(period || 'day');

  try {
    const stats = await getRechargeStats(range.start, range.end);
    await bot.sendMessage(chatId, buildStatsMessage(range, stats), {
      parse_mode: 'HTML'
    });
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi thống kê: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

module.exports = {
  handleThongKeCommand
};
