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

function renderWithdrawPage({ token, session, banks, initialOrder = null }) {
  const bankOptions = banks.map((bank) => (
    `<option value="${escapeHtml(bank.code)}" data-label="${escapeHtml(`${bank.name || bank.code} ${bank.code}`.toLowerCase())}">${escapeHtml(bank.name || bank.code)} (${escapeHtml(bank.code)})</option>`
  )).join('');
  const amountValue = session.amount ? String(session.amount) : '';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rút tiền</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f3f5f7;
      --surface: #ffffff;
      --text: #152033;
      --muted: #627083;
      --line: #d8e0ea;
      --input: #f9fbfd;
      --primary: #075fb8;
      --primary-hover: #034f9c;
      --danger: #c52828;
      --danger-hover: #aa1f1f;
      --soft: #edf2f7;
      --success-bg: #e8f6ee;
      --success: #11753b;
      --warn-bg: #fff5df;
      --warn: #946200;
      --error-bg: #fff0f0;
      --error: #b42318;
      --radius: 8px;
      --shadow: 0 12px 30px rgba(21, 32, 51, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, #e9f0f7 0, rgba(233, 240, 247, 0) 300px),
        var(--bg);
      color: var(--text);
    }

    main {
      width: min(720px, calc(100% - 28px));
      margin: 28px auto;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 28px;
      line-height: 1.15;
      margin: 0 0 6px;
      letter-spacing: 0;
    }

    h2 {
      font-size: 18px;
      margin: 0 0 14px;
      letter-spacing: 0;
    }

    .subtle {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .badge {
      flex: 0 0 auto;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.76);
      border-radius: 999px;
      padding: 7px 10px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    form, .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 22px;
      box-shadow: var(--shadow);
    }

    .field {
      margin-top: 16px;
    }

    .field:first-child {
      margin-top: 0;
    }

    label {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: #26364d;
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 7px;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }

    input, select, textarea {
      width: 100%;
      border: 1px solid #bcc8d6;
      border-radius: 7px;
      background: var(--input);
      color: var(--text);
      padding: 12px 13px;
      font-size: 16px;
      line-height: 1.3;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }

    input:focus, select:focus, textarea:focus {
      border-color: var(--primary);
      background: #fff;
      box-shadow: 0 0 0 3px rgba(7, 95, 184, 0.13);
    }

    select {
      min-height: 46px;
    }

    textarea {
      min-height: 82px;
      resize: vertical;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .notice {
      margin: 16px 0 0;
      border: 1px solid #f1d08a;
      background: var(--warn-bg);
      color: #5f4500;
      border-radius: 7px;
      padding: 12px 13px;
      font-size: 13px;
      line-height: 1.5;
    }

    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
    }

    button {
      border: 0;
      border-radius: 7px;
      padding: 12px 15px;
      min-height: 44px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.12s ease, background 0.12s ease, opacity 0.12s ease;
    }

    button:active {
      transform: translateY(1px);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      transform: none;
    }

    .primary { background: var(--primary); color: #fff; }
    .primary:hover { background: var(--primary-hover); }
    .secondary { background: var(--soft); color: var(--text); }
    .danger { background: var(--danger); color: #fff; }
    .danger:hover { background: var(--danger-hover); }

    .error {
      display: none;
      margin: 14px 0 0;
      border: 1px solid #ffd0d0;
      background: var(--error-bg);
      color: var(--error);
      border-radius: 7px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
    }

    .error:not(:empty) {
      display: block;
    }

    .status-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .status-pill {
      border-radius: 999px;
      padding: 7px 10px;
      background: var(--soft);
      color: var(--muted);
      font-weight: 800;
      font-size: 13px;
    }

    .status-pill.success {
      background: var(--success-bg);
      color: var(--success);
    }

    .status-pill.danger {
      background: var(--error-bg);
      color: var(--error);
    }

    .details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    .detail {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fbfcfe;
      padding: 11px 12px;
      min-width: 0;
    }

    .detail span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .detail strong {
      display: block;
      font-size: 15px;
      overflow-wrap: anywhere;
    }

    @media (max-width: 560px) {
      main { width: min(100% - 22px, 720px); margin: 18px auto; }
      .topbar { display: block; }
      .badge { display: inline-block; margin-top: 12px; }
      h1 { font-size: 24px; }
      form, .panel { padding: 17px; }
      .grid, .details { grid-template-columns: 1fr; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header class="topbar">
      <div>
        <h1>Rút tiền</h1>
        <p class="subtle">Nhập đúng thông tin tài khoản nhận tiền. Lệnh sẽ được gửi đi sau khi bạn bấm tạo lệnh.</p>
      </div>
      <div class="badge">Link tạm thời</div>
    </header>

    <form id="withdrawForm" ${initialOrder ? 'style="display:none;"' : ''}>
      <div class="grid">
        <div class="field">
          <label for="amount">Số tiền <span class="hint">VND</span></label>
          <input id="amount" name="amount" inputmode="numeric" value="${escapeHtml(amountValue)}" placeholder="100000" required>
        </div>
        <div class="field">
          <label for="bankSearch">Tìm ngân hàng <span class="hint">mã hoặc tên</span></label>
          <input id="bankSearch" autocomplete="off" placeholder="VD: VCB, Vietcombank">
        </div>
      </div>

      <div class="field">
        <label for="bankCode">Ngân hàng</label>
        <select id="bankCode" name="bankCode" required>
          <option value="">Chọn ngân hàng</option>
          ${bankOptions}
        </select>
      </div>

      <div class="grid">
        <div class="field">
          <label for="bankAccount">Số tài khoản</label>
          <input id="bankAccount" name="bankAccount" autocomplete="off" placeholder="Nhập số tài khoản" required>
        </div>
        <div class="field">
          <label for="bankAccountName">Tên chủ tài khoản</label>
          <input id="bankAccountName" name="bankAccountName" autocomplete="off" placeholder="Tên đúng trên ngân hàng" required>
        </div>
      </div>

      <div class="field">
        <label for="message">Ghi chú <span class="hint">không bắt buộc</span></label>
        <textarea id="message" name="message" placeholder="Ghi chú cho lệnh rút"></textarea>
      </div>

      <p class="notice">Kiểm tra kỹ ngân hàng, số tài khoản và tên chủ tài khoản. Thông tin sai có thể khiến lệnh bị từ chối hoặc xử lý chậm.</p>
      <div class="row">
        <button id="submitBtn" class="primary" type="submit">Tạo lệnh rút</button>
      </div>
      <p id="formError" class="error"></p>
    </form>

    <section id="statusPanel" class="panel" style="${initialOrder ? 'display:block;' : 'display:none;'} margin-top:16px;">
      <div class="status-head">
        <h2>Trạng thái lệnh</h2>
        <div id="statusPill" class="status-pill">Đang xử lý</div>
      </div>
      <div id="statusDetails" class="details"></div>
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
    const statusPill = document.getElementById('statusPill');
    const statusDetails = document.getElementById('statusDetails');
    const actionError = document.getElementById('actionError');
    const checkBtn = document.getElementById('checkBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const submitBtn = document.getElementById('submitBtn');
    const bankSearch = document.getElementById('bankSearch');
    const bankCode = document.getElementById('bankCode');
    const originalBankOptions = Array.from(bankCode.options).map((option) => ({
      value: option.value,
      text: option.textContent,
      label: option.dataset.label || option.textContent.toLowerCase()
    }));

    function formatMoney(value) {
      const num = Number(value || 0);
      return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
    }

    function setError(node, message) {
      node.textContent = message || '';
    }

    function setButtonLoading(button, loadingText) {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = loadingText;
      return () => {
        button.disabled = false;
        button.textContent = original;
      };
    }

    function getStatusLabel(status) {
      const labels = {
        submitted: 'Đã gửi',
        waiting: 'Đang chờ xử lý',
        processing: 'Đang xử lý',
        waitLink: 'Đang chờ xác nhận',
        pending: 'Chờ duyệt',
        nCheck: 'Cần kiểm tra lại',
        success: 'Thành công',
        deleted: 'Bị từ chối',
        cancel: 'Đã hủy',
        timeout: 'Quá hạn',
        failed: 'Thất bại'
      };
      return labels[status] || status || '-';
    }

    function renderDetail(label, value) {
      return '<div class="detail"><span>' + label + '</span><strong>' + String(value || '-') + '</strong></div>';
    }

    function renderOrder(order) {
      if (!order) return;
      statusPanel.style.display = 'block';
      statusPill.textContent = getStatusLabel(order.status);
      statusPill.className = 'status-pill';
      if (order.status === 'success') statusPill.classList.add('success');
      if (['deleted', 'cancel', 'timeout', 'failed'].includes(order.status)) statusPill.classList.add('danger');

      statusDetails.innerHTML = [
        renderDetail('Mã lệnh', order.requestId),
        renderDetail('Provider ID', order.providerChargeId),
        renderDetail('Số tiền', formatMoney(order.amount)),
        renderDetail('Ngân hàng', order.bankName || order.bankCode),
        renderDetail('Số TK', order.bankAccount),
        renderDetail('Tên TK', order.bankAccountName)
      ].join('');
      cancelBtn.disabled = !order.canCancel;
    }

    if (initialOrder) {
      renderOrder(initialOrder);
    }

    bankSearch.addEventListener('input', () => {
      const keyword = bankSearch.value.trim().toLowerCase();
      const current = bankCode.value;
      const filtered = originalBankOptions.filter((option, index) => {
        if (index === 0) return true;
        return !keyword || option.label.includes(keyword);
      });
      bankCode.innerHTML = filtered.map((option) => (
        '<option value="' + option.value + '">' + option.text + '</option>'
      )).join('');
      if (filtered.some((option) => option.value === current)) bankCode.value = current;
    });

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
      setError(formError, '');
      const done = setButtonLoading(submitBtn, 'Đang tạo...');
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const data = await callApi('/withdraw/submit', payload);
        form.style.display = 'none';
        renderOrder(data.order);
      } catch (error) {
        setError(formError, error.message);
      } finally {
        done();
      }
    });

    checkBtn.addEventListener('click', async () => {
      setError(actionError, '');
      const done = setButtonLoading(checkBtn, 'Đang kiểm tra...');
      try {
        const data = await callApi('/withdraw/status');
        renderOrder(data.order);
        if (data.throttled) setError(actionError, 'Vừa kiểm tra gần đây, đang hiển thị trạng thái đã lưu.');
      } catch (error) {
        setError(actionError, error.message);
      } finally {
        done();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      setError(actionError, '');
      if (!confirm('Bạn chắc chắn muốn hủy lệnh rút này?')) return;
      const done = setButtonLoading(cancelBtn, 'Đang hủy...');
      try {
        const data = await callApi('/withdraw/cancel');
        renderOrder(data.order);
        if (data.message) setError(actionError, data.message);
      } catch (error) {
        setError(actionError, error.message);
      } finally {
        done();
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
