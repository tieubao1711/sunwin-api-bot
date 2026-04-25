async function sendUsage(bot, chatId) {
  await bot.sendMessage(
    chatId,
    [
      'Cách dùng:',
      '/info username password',
      '/naptien 50000',
      '/ruttien',
      '/ruttien 100000',
      '/danhsachrut',
      '/danhsachrut mine',
      '/thongke',
      '/thongke week',
      '/thongke month',
      '',
      '/info dùng để xem thông tin tài khoản và thao tác lịch sử/đổi mật khẩu.',
      '/naptien dùng độc lập để tạo lệnh nạp tiền.',
      '/ruttien mở form rút tiền bảo mật bằng link tạm.',
      '/danhsachrut xem 10 lệnh rút gần nhất.',
      '/thongke dùng để xem doanh thu nạp tiền thành công.'
    ].join('\n')
  );
}

module.exports = { sendUsage };
