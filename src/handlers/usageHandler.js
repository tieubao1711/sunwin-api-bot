async function sendUsage(bot, chatId) {
  await bot.sendMessage(
    chatId,
    [
      'Cách dùng:',
      '/info username password',
      '/naptien 50000',
      '/thongke',
      '/thongke week',
      '/thongke month',
      '',
      '/info dùng để xem thông tin tài khoản và thao tác lịch sử/đổi mật khẩu.',
      '/naptien dùng độc lập để tạo lệnh nạp tiền.',
      '/thongke dùng để xem doanh thu nạp tiền thành công.'
    ].join('\n')
  );
}

module.exports = { sendUsage };
