# Telegram Account Bot

Bot Telegram gọi API local của bạn để:
- login và lấy thông tin cơ bản tài khoản
- xem lịch sử cược bằng nút inline
- xem lịch sử nạp/rút bằng nút inline
- đổi mật khẩu bằng nút inline
- tạo lệnh nạp tiền qua bank, hiển thị thông tin chuyển khoản và QR

## Cài đặt

```bash
npm install
cp .env.example .env
```

Điền file `.env`:

```env
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
API_BASE_URL=http://localhost:3000
ALLOWED_USER_IDS=
REQUEST_TIMEOUT_MS=30000
```

## Chạy bot

```bash
npm start
```

## Cấu hình nạp tiền

Thêm các biến sau vào `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=telegram_account_bot
RECHARGE_API_BASE_URL=https://your-recharge-api-domain
RECHARGE_API_KEY=YOUR_API_KEY
RECHARGE_SIGN_KEY=
RECHARGE_CALLBACK_PASSWORD_LV2=
RECHARGE_CALLBACK_PORT=3001
RECHARGE_CALLBACK_PATH=/recharge/callback
RECHARGE_CALLBACK_PUBLIC_URL=https://your-public-domain/recharge/callback
```

Dùng `/naptien 50000` độc lập với `/info`. Bot sẽ lấy danh sách bank, tạo lệnh nạp theo Telegram userId, gửi thông tin chuyển khoản và QR. Callback thành công sẽ cập nhật MongoDB collection `recharge_orders` và báo lại Telegram.

## Cách dùng

Gửi lệnh:

```bash
/info username password
```

Sau khi login thành công, bot sẽ chỉ hiện:
- username
- display name
- phone
- email
- số dư ví cơ bản

Bên dưới sẽ có 3 nút:
- Xem lịch sử cược
- Xem lịch sử nạp/rút
- Đổi mật khẩu

## Luồng đổi mật khẩu

1. Bấm nút `Đổi mật khẩu`
2. Gửi tin nhắn tiếp theo là mật khẩu mới
3. Bot dùng `accessToken` hiện tại + mật khẩu cũ từ phiên `/info` gần nhất để gọi API đổi mật khẩu

## API mà bot gọi

- `POST /account/info`
- `POST /account/transactions`
- `POST /account/slip-history`
- `POST /account/change-password`
- `GET /api/Bank/getBankAvailable`
- `GET /api/v2/RegCharge`

## Ghi chú

- Session `/info` được lưu tạm trong memory theo `chatId:userId`
- Lệnh `/naptien` được lưu bền vững trong MongoDB
- Nếu restart bot thì cần `/info` lại để dùng các nút liên quan tài khoản
- Nếu bạn đặt `ALLOWED_USER_IDS`, chỉ user Telegram nằm trong whitelist mới dùng được bot
