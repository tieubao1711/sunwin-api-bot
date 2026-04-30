const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const {
  getUnsettledSuccessfulRechargeOrders,
  createRevenueSettlement,
  markRechargeOrdersSettled,
  getRecentRevenueSettlements
} = require('../services/rechargeStore');
const { escapeHtml, formatNumber } = require('../utils/formatters');
const { isAllowedUser, extractAxiosError } = require('../utils/botUtils');

async function handleChotDoanhThuCommand(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Ban khong co quyen dung bot nay.');
    return;
  }

  await bot.sendMessage(chatId, 'Dang chot doi soat doanh thu...');

  try {
    const orders = await getUnsettledSuccessfulRechargeOrders();
    if (!orders.length) {
      await bot.sendMessage(chatId, 'Khong co lenh nap thanh cong nao chua chot.');
      return;
    }

    const closedAt = new Date();
    const settlementId = createSettlementId();
    const totalAmount = orders.reduce((sum, order) => sum + getOrderAmount(order), 0);
    const orderIds = orders.map((order) => order._id);

    const settlement = {
      settlementId,
      chatId,
      closedAt,
      closedByUserId: userId,
      closedByUsername: msg.from.username || '',
      totalAmount,
      totalOrders: orders.length,
      firstCompletedAt: getOrderCompletedAt(orders[0]),
      lastCompletedAt: getOrderCompletedAt(orders[orders.length - 1]),
      orderIds
    };

    await createRevenueSettlement(settlement);
    const updateResult = await markRechargeOrdersSettled(orderIds, settlementId, closedAt);

    const filePath = writeSettlementXlsx(settlement, orders);
    try {
      await bot.sendDocument(chatId, filePath, {
        caption: [
          `<b>Da chot doi soat doanh thu</b>`,
          `Ma chot: <code>${escapeHtml(settlementId)}</code>`,
          `Doanh thu: <b>${formatNumber(totalAmount)}</b>`,
          `Lenh nap: <b>${formatNumber(updateResult.modifiedCount || orders.length)}</b>`
        ].join('\n'),
        parse_mode: 'HTML'
      });
    } finally {
      fs.unlink(filePath, () => {});
    }
  } catch (error) {
    await bot.sendMessage(chatId, `Loi chot doanh thu: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

async function handleLichSuChotCommand(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Ban khong co quyen dung bot nay.');
    return;
  }

  try {
    const settlements = await getRecentRevenueSettlements(10);
    await bot.sendMessage(chatId, buildSettlementHistoryMessage(settlements), {
      parse_mode: 'HTML'
    });
  } catch (error) {
    await bot.sendMessage(chatId, `Loi lay lich su chot: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

function createSettlementId() {
  return `settle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function writeSettlementXlsx(settlement, orders) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ['Ma chot', settlement.settlementId],
    ['Thoi gian chot', formatDateTime(settlement.closedAt)],
    ['Nguoi chot', settlement.closedByUsername || settlement.closedByUserId],
    ['Tong doanh thu', settlement.totalAmount],
    ['Tong lenh nap', settlement.totalOrders],
    ['Lenh dau tien', formatDateTime(settlement.firstCompletedAt)],
    ['Lenh cuoi cung', formatDateTime(settlement.lastCompletedAt)]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Tong quan');

  const detailRows = [
    [
      'STT',
      'Request ID',
      'Ma GD',
      'So tien',
      'Trang thai',
      'Ngan hang',
      'Thoi gian tao',
      'Thoi gian thanh cong',
      'Telegram user',
      'Chat ID'
    ],
    ...orders.map((order, index) => [
      index + 1,
      order.requestId || '',
      order.chargeCode || order.rechargeData?.code || '',
      getOrderAmount(order),
      order.status || '',
      order.selectedBank?.name || order.selectedBank?.code || order.rechargeData?.bank_provider || '',
      formatDateTime(order.createdAt),
      formatDateTime(getOrderCompletedAt(order)),
      order.telegramUsername || order.userId || '',
      order.chatId || ''
    ])
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(detailRows), 'Chi tiet');

  const filePath = path.join(os.tmpdir(), `${settlement.settlementId}.xlsx`);
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

function buildSettlementHistoryMessage(settlements) {
  if (!settlements.length) {
    return 'Chua co lan chot doanh thu nao.';
  }

  const lines = ['<b>LICH SU CHOT DOANH THU</b>'];
  settlements.forEach((settlement, index) => {
    lines.push('');
    lines.push(`${index + 1}. <code>${escapeHtml(settlement.settlementId || '-')}</code>`);
    lines.push(`Thoi gian: ${escapeHtml(formatDateTime(settlement.closedAt))}`);
    lines.push(`Doanh thu: <b>${formatNumber(settlement.totalAmount)}</b>`);
    lines.push(`Lenh nap: <b>${formatNumber(settlement.totalOrders)}</b>`);
    lines.push(`Nguoi chot: ${escapeHtml(settlement.closedByUsername || settlement.closedByUserId || '-')}`);
  });

  return lines.join('\n');
}

function getOrderAmount(order) {
  const amount = Number(order.chargeAmount ?? order.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getOrderCompletedAt(order) {
  return order.completedAt || order.updatedAt || order.createdAt || null;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

module.exports = {
  handleChotDoanhThuCommand,
  handleLichSuChotCommand
};
