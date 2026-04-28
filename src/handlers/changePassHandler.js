const {
  fetchAccountInfo,
  changePassword
} = require('../services/apiClient');
const { escapeHtml } = require('../utils/formatters');
const { isAllowedUser, extractAxiosError } = require('../utils/botUtils');

async function handleChangePassCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Ban khong co quyen dung bot nay.');
    return;
  }

  const payload = parseChangePassInput(match?.[1] || '');
  if (!payload) {
    await bot.sendMessage(
      chatId,
      [
        'Cach dung:',
        '/changepass username|password newpassword',
        '',
        'Vi du:',
        '/changepass user01|oldPass123 newPass456'
      ].join('\n')
    );
    return;
  }

  const { username, oldPassword, newPassword } = payload;

  await bot.sendMessage(chatId, 'Dang dang nhap va doi mat khau...');

  try {
    const loginResponse = await fetchAccountInfo(username, oldPassword);
    if (!loginResponse?.success || !loginResponse?.data?.accessToken) {
      await bot.sendMessage(chatId, `Login that bai: ${escapeHtml(loginResponse?.message || 'Khong lay duoc accessToken')}`, {
        parse_mode: 'HTML'
      });
      return;
    }

    const changeResponse = await changePassword(
      loginResponse.data.accessToken,
      oldPassword,
      newPassword
    );
    const result = normalizeChangePasswordResponse(changeResponse);

    if (!result.success) {
      await bot.sendMessage(
        chatId,
        `<b>Doi mat khau that bai</b>\n<code>${escapeHtml(result.message)}</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await bot.sendMessage(chatId, `<b>${escapeHtml(result.message)}</b>`, {
      parse_mode: 'HTML'
    });
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `<b>Doi mat khau that bai</b>\n<code>${escapeHtml(extractAxiosError(error))}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

function parseChangePassInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const firstSpaceIndex = raw.search(/\s/);
  if (firstSpaceIndex < 0) return null;

  const credentialPart = raw.slice(0, firstSpaceIndex).trim();
  const newPassword = raw.slice(firstSpaceIndex).trim();
  if (!credentialPart || !newPassword || !credentialPart.includes('|')) return null;

  const [username, ...passwordParts] = credentialPart.split('|');
  const oldPassword = passwordParts.join('|');
  if (!username.trim() || !oldPassword.trim()) return null;

  return {
    username: username.trim(),
    oldPassword: oldPassword.trim(),
    newPassword
  };
}

function normalizeChangePasswordResponse(response) {
  const status = response?.data?.status ?? response?.status;
  const success = response?.success === true && (status === undefined || status === 0);
  const message =
    response?.data?.data?.message ||
    response?.data?.message ||
    response?.message ||
    (success ? 'Doi mat khau thanh cong' : 'Doi mat khau that bai');

  return { success, message };
}

module.exports = { handleChangePassCommand };
