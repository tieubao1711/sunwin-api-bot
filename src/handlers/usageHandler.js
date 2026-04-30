async function sendUsage(bot, chatId) {
  await bot.sendMessage(
    chatId,
    [
      'Cách dùng:',
      '/info username password',
      '/info username|password',
      '/changepass username|password newpassword',
      '/changepass username password newpassword',
      '/history username|password',
      '/naptien 50000',
      '/ruttien',
      '/ruttien 100000',
      '/danhsachrut',
      '/danhsachrut mine',
      '/thongke',
      '/thongke week',
      '/thongke month',
      '/chotdoanhthu',
      '/lichsuchot',
      '',
      '/info dùng để xem thông tin tài khoản và thao tác lịch sử/đổi mật khẩu.',
      '/naptien dùng độc lập để tạo lệnh nạp tiền.',
      '/ruttien mở form rút tiền bảo mật bằng link tạm.',
      '/danhsachrut xem 10 lệnh rút gần nhất.',
      '/thongke dùng để xem doanh thu nạp tiền thành công.',
      '/chotdoanhthu chot cac lenh nap thanh cong chua doi soat va xuat file XLSX.',
      '/lichsuchot xem 10 lan chot doanh thu gan nhat.'
    ].join('\n')
  );
}

module.exports = { sendUsage };
