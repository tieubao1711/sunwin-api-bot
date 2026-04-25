const {
  fetchAccountInfo,
  fetchTransactions,
  fetchSlipHistory,
  changePassword
} = require('../services/apiClient');
const {
  buildBasicInfoMessage,
  buildTransactionsMessage,
  buildDepositHistoryMessage,
  buildWithdrawHistoryMessage,
  escapeHtml
} = require('../utils/formatters');
const {
  getSessionKey,
  isAllowedUser,
  extractAxiosError
} = require('../utils/botUtils');
const { sendUsage } = require('./usageHandler');

const sessions = new Map();
const pendingActions = new Map();

function getAccountInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎮 Lịch sử cược', callback_data: 'view_bets' }
      ],
      [
        { text: '🏦 Lịch sử nạp', callback_data: 'view_deposit' },
        { text: '💸 Lịch sử rút', callback_data: 'view_withdraw' }
      ],
      [
        { text: '🔑 Đổi mật khẩu', callback_data: 'change_password' }
      ]
    ]
  };
}

async function handleInfoCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAllowedUser(userId)) {
    await bot.sendMessage(chatId, 'Bạn không có quyền dùng bot này.');
    return;
  }

  const args = (match?.[1] || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) {
    await sendUsage(bot, chatId);
    return;
  }

  const [username, password] = args;

  await bot.sendMessage(chatId, 'Đang đăng nhập và lấy thông tin...');

  try {
    const response = await fetchAccountInfo(username, password);
    if (!response?.success || !response?.data?.accessToken) {
      await bot.sendMessage(chatId, `Login thất bại: ${escapeHtml(response?.message || 'Không lấy được accessToken')}`, {
        parse_mode: 'HTML'
      });
      return;
    }

    const sessionKey = getSessionKey(chatId, userId);
    sessions.set(sessionKey, {
      username,
      password,
      accessToken: response.data.accessToken,
      wsToken: response.data.wsToken,
      profile: response.data.profile
    });
    pendingActions.delete(sessionKey);

    await bot.sendMessage(chatId, buildBasicInfoMessage(response.data), {
      parse_mode: 'HTML',
      reply_markup: getAccountInlineKeyboard()
    });
  } catch (error) {
    await bot.sendMessage(chatId, `Lỗi: ${escapeHtml(extractAxiosError(error))}`, {
      parse_mode: 'HTML'
    });
  }
}

async function handleAccountCallback(bot, query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const sessionKey = getSessionKey(chatId, userId);
  const session = sessions.get(sessionKey);

  if (!['view_bets', 'view_deposit', 'view_withdraw', 'change_password'].includes(query.data)) {
    return false;
  }

  if (!session) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Chưa có phiên đăng nhập. Dùng /info trước nhé.'
    });
    return true;
  }

  try {
    if (query.data === 'view_bets') {
      await bot.answerCallbackQuery(query.id, {
        text: 'Đang lấy lịch sử cược...'
      });

      const response = await fetchTransactions(session.accessToken, {
        limit: 5,
        skip: 0,
        assetName: 'gold'
      });

      await bot.sendMessage(
        chatId,
        buildTransactionsMessage(response.data || response),
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (query.data === 'view_deposit') {
      await bot.answerCallbackQuery(query.id, {
        text: 'Đang lấy lịch sử nạp...'
      });

      const response = await fetchSlipHistory(session.accessToken, {
        slipType: 1,
        limit: 5,
        skip: 0
      });

      await bot.sendMessage(
        chatId,
        buildDepositHistoryMessage(response.data || response),
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (query.data === 'view_withdraw') {
      await bot.answerCallbackQuery(query.id, {
        text: 'Đang lấy lịch sử rút...'
      });

      const response = await fetchSlipHistory(session.accessToken, {
        slipType: 2,
        limit: 5,
        skip: 0
      });

      await bot.sendMessage(
        chatId,
        buildWithdrawHistoryMessage(response.data || response),
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (query.data === 'change_password') {
      await promptPasswordChange(bot, query, sessionKey, chatId, userId);
      return true;
    }
  } catch (error) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Có lỗi xảy ra.'
    });

    await bot.sendMessage(
      chatId,
      `❌ <b>Lỗi</b>\n<code>${escapeHtml(extractAxiosError(error))}</code>`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  return false;
}

async function promptPasswordChange(bot, query, sessionKey, chatId, userId) {
  pendingActions.set(sessionKey, {
    type: 'await_new_password',
    requestedInChatId: chatId,
    requestedByUserId: userId
  });

  await bot.answerCallbackQuery(query.id, {
    text: 'Hãy reply mật khẩu mới.'
  });

  const sent = await bot.sendMessage(
    chatId,
    '🔑 Hãy <b>reply vào tin nhắn này</b> với <b>mật khẩu mới</b> để đổi mật khẩu.',
    {
      parse_mode: 'HTML',
      reply_markup: {
        force_reply: true
      }
    }
  );

  pendingActions.set(sessionKey, {
    type: 'await_new_password',
    requestedInChatId: chatId,
    requestedByUserId: userId,
    replyMessageId: sent.message_id
  });
}

async function handleAccountTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || '').trim();

  const sessionKey = getSessionKey(chatId, userId);
  const pending = pendingActions.get(sessionKey);

  if (!pending || pending.type !== 'await_new_password') return false;

  const isPrivate = msg.chat.type === 'private';
  const isReplyMatch =
    msg.reply_to_message &&
    pending.replyMessageId &&
    msg.reply_to_message.message_id === pending.replyMessageId;

  if (!isPrivate && !isReplyMatch) return false;

  if (!text) {
    await bot.sendMessage(chatId, '❌ Mật khẩu không hợp lệ.');
    return true;
  }

  const session = sessions.get(sessionKey);
  if (!session) {
    pendingActions.delete(sessionKey);
    await bot.sendMessage(chatId, '❌ Phiên đăng nhập hết hạn. Dùng /info lại.');
    return true;
  }

  try {
    await changePassword(session.accessToken, session.password, text);

    pendingActions.delete(sessionKey);

    await bot.sendMessage(
      chatId,
      '✅ <b>Đổi mật khẩu thành công</b>',
      { parse_mode: 'HTML' }
    );

    session.password = text;
    sessions.set(sessionKey, session);
  } catch (err) {
    pendingActions.delete(sessionKey);

    await bot.sendMessage(
      chatId,
      `❌ <b>Đổi mật khẩu thất bại</b>\n<code>${escapeHtml(extractAxiosError(err))}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  return true;
}

module.exports = {
  handleInfoCommand,
  handleAccountCallback,
  handleAccountTextMessage
};
