const crypto = require('crypto');
const { URLSearchParams } = require('url');
const env = require('../config/env');
const {
  fetchWithdrawBanks,
  createWithdrawCharge,
  checkCharge,
  cancelCharge
} = require('./withdrawApiClient');
const {
  getUsableWithdrawSession,
  touchWithdrawSession,
  markWithdrawSessionUsed,
  createWithdrawOrder,
  updateWithdrawOrderAfterSubmit,
  getWithdrawOrderBySessionToken,
  markWithdrawCheckResult,
  markWithdrawCancelResult,
  canCheckWithdrawOrder,
  canCancelWithdrawOrder
} = require('./withdrawStore');

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createRequestId() {
  return `wd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getPublicBaseUrl() {
  if (env.rechargeCallbackPublicUrl) {
    const url = new URL(env.rechargeCallbackPublicUrl);
    return `${url.protocol}//${url.host}`;
  }

  return `http://localhost:${env.rechargeCallbackPort}`;
}

function getWithdrawUrl(token) {
  const params = new URLSearchParams({ token });
  return `${getPublicBaseUrl()}/withdraw?${params.toString()}`;
}

function normalizeBanks(response) {
  return response?.data || [];
}

function formatNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
}

function renderWithdrawPage({ token, session, banks, initialOrder = null }) {
  const bankOptions = banks.map((bank) => (
    `<option value="${escapeHtml(bank.code)}">${escapeHtml(bank.name || bank.code)} (${escapeHtml(bank.code)})</option>`
  )).join('');
  const amountValue = session.amount ? String(session.amount) : '';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rút tiền</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; background: #f4f6f8; color: #17202a; }
    main { width: min(680px, calc(100% - 32px)); margin: 32px auto; }
    h1 { font-size: 24px; margin: 0 0 20px; }
    form, .panel { background: #fff; border: 1px solid #d9e1ea; border-radius: 8px; padding: 20px; }
    label { display: block; font-weight: 700; margin: 14px 0 6px; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #bdc7d3; border-radius: 6px; padding: 11px 12px; font-size: 16px; }
    textarea { min-height: 72px; resize: vertical; }
    button { border: 0; border-radius: 6px; padding: 11px 14px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .primary { background: #0b66c3; color: #fff; }
    .secondary { background: #eef2f7; color: #17202a; }
    .danger { background: #c62828; color: #fff; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .status { white-space: pre-line; line-height: 1.55; margin-top: 16px; }
    .error { color: #b00020; }
    .muted { color: #637083; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>Rút tiền</h1>
    <form id="withdrawForm" ${initialOrder ? 'style="display:none;"' : ''}>
      <label for="amount">Số tiền</label>
      <input id="amount" name="amount" inputmode="numeric" value="${escapeHtml(amountValue)}" required>

      <label for="bankCode">Ngân hàng</label>
      <select id="bankCode" name="bankCode" required>
        <option value="">Chọn ngân hàng</option>
        ${bankOptions}
      </select>

      <label for="bankAccount">Số tài khoản</label>
      <input id="bankAccount" name="bankAccount" autocomplete="off" required>

      <label for="bankAccountName">Tên chủ tài khoản</label>
      <input id="bankAccountName" name="bankAccountName" autocomplete="off" required>

      <label for="message">Ghi chú</label>
      <textarea id="message" name="message"></textarea>

      <p class="muted">Kiểm tra kỹ số tài khoản và tên chủ tài khoản trước khi xác nhận.</p>
      <div class="row">
        <button class="primary" type="submit">Tạo lệnh rút</button>
      </div>
      <p id="formError" class="error"></p>
    </form>

    <section id="statusPanel" class="panel" style="${initialOrder ? 'display:block;' : 'display:none;'} margin-top:16px;">
      <h2>Trạng thái lệnh</h2>
      <div id="statusText" class="status"></div>
      <div class="row">
        <button id="checkBtn" class="secondary" type="button">Kiểm tra trạng thái</button>
        <button id="cancelBtn" class="danger" type="button">Hủy lệnh</button>
      </div>
      <p id="actionError" class="error"></p>
    </section>
  </main>

  <script>
    const token = ${JSON.stringify(token)};
    const initialOrder = ${JSON.stringify(initialOrder)};
    const form = document.getElementById('withdrawForm');
    const formError = document.getElementById('formError');
    const statusPanel = document.getElementById('statusPanel');
    const statusText = document.getElementById('statusText');
    const actionError = document.getElementById('actionError');
    const checkBtn = document.getElementById('checkBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    function formatMoney(value) {
      const num = Number(value || 0);
      return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
    }

    function renderOrder(order) {
      if (!order) return;
      statusPanel.style.display = 'block';
      statusText.textContent = [
        'Mã lệnh: ' + order.requestId,
        'Trạng thái: ' + order.status,
        'Số tiền: ' + formatMoney(order.amount),
        'Ngân hàng: ' + (order.bankName || order.bankCode || '-'),
        'Số TK: ' + (order.bankAccount || '-'),
        'Tên TK: ' + (order.bankAccountName || '-'),
        'Provider ID: ' + (order.providerChargeId || '-')
      ].join('\\n');
      cancelBtn.disabled = !order.canCancel;
    }

    if (initialOrder) {
      renderOrder(initialOrder);
    }

    async function callApi(path, payload) {
      const res = await fetch(path + '?token=' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Có lỗi xảy ra');
      return data;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.textContent = '';
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const data = await callApi('/withdraw/submit', payload);
        form.style.display = 'none';
        renderOrder(data.order);
      } catch (error) {
        formError.textContent = error.message;
      }
    });

    checkBtn.addEventListener('click', async () => {
      actionError.textContent = '';
      try {
        const data = await callApi('/withdraw/status');
        renderOrder(data.order);
        if (data.throttled) actionError.textContent = 'Vừa kiểm tra gần đây, đang hiển thị trạng thái đã lưu.';
      } catch (error) {
        actionError.textContent = error.message;
      }
    });

    cancelBtn.addEventListener('click', async () => {
      actionError.textContent = '';
      if (!confirm('Bạn chắc chắn muốn hủy lệnh rút này?')) return;
      try {
        const data = await callApi('/withdraw/cancel');
        renderOrder(data.order);
      } catch (error) {
        actionError.textContent = error.message;
      }
    });
  </script>
</body>
</html>`;
}

function serializeOrder(order) {
  if (!order) return null;
  return {
    requestId: order.requestId,
    status: order.status,
    amount: order.amount,
    bankCode: order.bankCode,
    bankName: order.bankName,
    bankAccount: order.bankAccount,
    bankAccountName: order.bankAccountName,
    providerChargeId: order.providerChargeId,
    providerMessage: order.providerMessage,
    canCancel: canCancelWithdrawOrder(order)
  };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 32) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function validateSubmitPayload(payload) {
  const amount = Number(String(payload.amount || '').replace(/[,. ]/g, ''));
  const bankCode = String(payload.bankCode || '').trim();
  const bankAccount = String(payload.bankAccount || '').trim();
  const bankAccountName = String(payload.bankAccountName || '').trim();
  const message = String(payload.message || '').trim();

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Số tiền không hợp lệ.');
  }
  if (!bankCode) throw new Error('Vui lòng chọn ngân hàng.');
  if (!bankAccount) throw new Error('Vui lòng nhập số tài khoản.');
  if (!bankAccountName) throw new Error('Vui lòng nhập tên chủ tài khoản.');

  return { amount, bankCode, bankAccount, bankAccountName, message };
}

async function handleWithdrawWebRequest(req, res, url) {
  if (!url.pathname.startsWith('/withdraw')) return false;

  const token = url.searchParams.get('token') || '';
  const session = await getUsableWithdrawSession(token);
  if (!session) {
    if (req.method === 'GET') {
      sendHtml(res, 403, '<h1>Link rút tiền không hợp lệ hoặc đã hết hạn.</h1>');
    } else {
      sendJson(res, 403, { ok: false, message: 'Link rút tiền không hợp lệ hoặc đã hết hạn.' });
    }
    return true;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/withdraw') {
      await touchWithdrawSession(token);
      const existingOrder = await getWithdrawOrderBySessionToken(token);
      if (existingOrder) {
        sendHtml(res, 200, renderWithdrawPage({
          token,
          session,
          banks: [],
          initialOrder: serializeOrder(existingOrder)
        }));
        return true;
      }
      const bankResponse = await fetchWithdrawBanks();
      if (bankResponse?.stt !== 1) {
        sendHtml(res, 502, `<h1>Không lấy được danh sách ngân hàng</h1><p>${escapeHtml(bankResponse?.msg || '')}</p>`);
        return true;
      }
      sendHtml(res, 200, renderWithdrawPage({
        token,
        session,
        banks: normalizeBanks(bankResponse)
      }));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/withdraw/submit') {
      const existingOrder = await getWithdrawOrderBySessionToken(token);
      if (existingOrder) {
        sendJson(res, 200, { ok: true, order: serializeOrder(existingOrder) });
        return true;
      }

      const payload = validateSubmitPayload(await readJsonBody(req));
      const bankResponse = await fetchWithdrawBanks();
      const bank = normalizeBanks(bankResponse).find((item) => item.code === payload.bankCode);
      if (!bank) throw new Error('Ngân hàng không hợp lệ.');

      const requestId = createRequestId();
      await createWithdrawOrder({
        requestId,
        chatId: session.chatId,
        userId: session.userId,
        telegramUsername: session.telegramUsername || '',
        memberIdentity: String(session.userId),
        amount: payload.amount,
        bankCode: bank.code,
        bankName: bank.name || bank.code,
        bankAccount: payload.bankAccount,
        bankAccountName: payload.bankAccountName,
        message: payload.message
      });

      const apiResponse = await createWithdrawCharge({
        bankCode: bank.code,
        bankAccount: payload.bankAccount,
        bankAccountName: payload.bankAccountName,
        amount: payload.amount,
        memberIdentity: String(session.userId),
        requestId,
        callbackUrl: env.rechargeCallbackPublicUrl || `${getPublicBaseUrl()}${env.rechargeCallbackPath}`,
        message: payload.message
      });

      const order = await updateWithdrawOrderAfterSubmit(requestId, apiResponse);
      await markWithdrawSessionUsed(token, requestId);

      if (apiResponse?.stt !== 1) {
        sendJson(res, 400, { ok: false, message: apiResponse?.msg || 'Tạo lệnh rút thất bại.', order: serializeOrder(order) });
        return true;
      }

      sendJson(res, 200, { ok: true, order: serializeOrder(order) });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/withdraw/status') {
      const order = await getWithdrawOrderBySessionToken(token);
      if (!order) throw new Error('Chưa có lệnh rút.');
      if (!order.providerChargeId) {
        sendJson(res, 200, { ok: true, order: serializeOrder(order), throttled: false });
        return true;
      }

      if (!(await canCheckWithdrawOrder(order))) {
        sendJson(res, 200, { ok: true, order: serializeOrder(order), throttled: true });
        return true;
      }

      const response = await checkCharge(order.providerChargeId);
      const updatedOrder = await markWithdrawCheckResult(order.requestId, response);
      sendJson(res, 200, { ok: true, order: serializeOrder(updatedOrder), throttled: false });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/withdraw/cancel') {
      const order = await getWithdrawOrderBySessionToken(token);
      if (!order) throw new Error('Chưa có lệnh rút.');
      if (!canCancelWithdrawOrder(order)) throw new Error('Trạng thái hiện tại không thể hủy.');

      const response = await cancelCharge(order.providerChargeId);
      const updatedOrder = await markWithdrawCancelResult(order.requestId, response);
      sendJson(res, response?.stt === 1 ? 200 : 400, {
        ok: response?.stt === 1,
        message: response?.msg || '',
        order: serializeOrder(updatedOrder)
      });
      return true;
    }

    sendJson(res, 404, { ok: false, message: 'not_found' });
    return true;
  } catch (error) {
    sendJson(res, 400, { ok: false, message: error.message || 'Có lỗi xảy ra.' });
    return true;
  }
}

module.exports = {
  getWithdrawUrl,
  handleWithdrawWebRequest
};
