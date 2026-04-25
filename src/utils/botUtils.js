const env = require('../config/env');

function getSessionKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function isAllowedUser(userId) {
  if (!env.allowedUserIds.length) return true;
  return env.allowedUserIds.includes(String(userId));
}

function extractAxiosError(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Đã xảy ra lỗi không xác định'
  );
}

module.exports = {
  getSessionKey,
  isAllowedUser,
  extractAxiosError
};
