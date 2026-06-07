import type { PublicSession } from './session.service.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Small embedded stylesheet (no external assets, no framework) — RNF08.
const STYLE = `
:root { --brand:#6f4e37; --bg:#faf7f2; --ink:#1f1b16; --muted:#7a7166; --err:#b3261e; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: var(--bg); color: var(--ink); }
main { max-width: 420px; margin: 0 auto; padding: 24px 20px 40px; }
.brand { font-weight:700; color:var(--brand); letter-spacing:.5px; font-size:18px; }
.card { background:#fff; border:1px solid #ece5db; border-radius:14px; padding:20px; margin-top:16px;
  box-shadow:0 1px 2px rgba(0,0,0,.04); }
.merchant { color:var(--muted); font-size:14px; margin:0 0 4px; }
.amount { font-size:34px; font-weight:700; margin:8px 0 2px; }
.amount small { font-size:14px; font-weight:600; color:var(--brand); }
.usd { color:var(--muted); font-size:13px; margin:0 0 8px; }
label { display:block; font-size:14px; font-weight:600; margin:16px 0 6px; }
input[type=tel] { width:100%; padding:12px; font-size:16px; border:1px solid #d8cfc2;
  border-radius:10px; }
input[type=tel]:focus { outline:2px solid var(--brand); border-color:var(--brand); }
.error { color:var(--err); font-size:13px; min-height:18px; margin:6px 0 0; }
button { width:100%; margin-top:16px; padding:13px; font-size:16px; font-weight:700; color:#fff;
  background:var(--brand); border:0; border-radius:10px; cursor:pointer; }
button[disabled] { opacity:.6; cursor:progress; }
.expires { color:var(--muted); font-size:12px; margin-top:14px; text-align:center; }
.state { font-size:18px; font-weight:700; }
`;

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · CoffePay</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
${script}
</body>
</html>`;
}

/** Checkout form for a payable (PENDING, not expired) session — RF03 / RNF08. */
export function renderCheckoutPage(s: PublicSession): string {
  const sid = escapeHtml(s.sessionId);
  const body = `<div class="brand">CoffePay</div>
<div class="card" data-session-id="${sid}">
  <p class="merchant">Pagamento a <strong>${escapeHtml(s.merchantName)}</strong> · ordem ${escapeHtml(s.orderId)}</p>
  <p class="amount">${escapeHtml(s.amountMZN)} <small>MZN</small></p>
  <p class="usd">${escapeHtml(s.amountUSD)} USD</p>
  <form id="pay-form" method="post" action="/sessions/${sid}/pay" novalidate>
    <label for="phone">Número de telemóvel (M-Pesa)</label>
    <input id="phone" name="phone" type="tel" inputmode="numeric"
           placeholder="84xxxxxxx" required autocomplete="tel"
           aria-describedby="phone-error" />
    <p id="phone-error" class="error" role="alert" aria-live="polite"></p>
    <button type="submit" id="submit-btn">Confirmar pagamento</button>
  </form>
  <p class="expires">Expira em ${escapeHtml(s.expiresAt)}</p>
</div>`;

  const script = `<script>
(function () {
  var form = document.getElementById('pay-form');
  var phone = document.getElementById('phone');
  var err = document.getElementById('phone-error');
  var btn = document.getElementById('submit-btn');
  var sid = ${JSON.stringify(s.sessionId)};
  var idemKey = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

  function showError(m) { err.textContent = m || ''; }

  async function validatePhone() {
    showError('');
    var value = (phone.value || '').trim();
    if (!value) { return false; }
    try {
      var r = await fetch('/sessions/' + sid + '/validate-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value }),
      });
      if (r.ok) { return true; }
      var b = await r.json().catch(function () { return {}; });
      showError(b.message || 'Número inválido. Use um número M-Pesa moçambicano.');
      return false;
    } catch (e) {
      showError('Não foi possível validar o número. Tente novamente.');
      return false;
    }
  }

  phone.addEventListener('blur', validatePhone);

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    showError('');
    var ok = await validatePhone();
    if (!ok) { phone.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'A processar…';
    try {
      var r = await fetch('/sessions/' + sid + '/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
        body: JSON.stringify({ phone: phone.value.trim() }),
      });
      if (r.status === 202) {
        document.querySelector('main').innerHTML =
          '<div class="brand">CoffePay</div>' +
          '<div class="card"><p class="state">A aguardar confirmação…</p>' +
          '<p class="usd">Aprove o pagamento no seu telemóvel (M-Pesa).</p></div>';
        return;
      }
      var b = await r.json().catch(function () { return {}; });
      showError(b.message || 'Não foi possível iniciar o pagamento.');
      btn.disabled = false;
      btn.textContent = 'Confirmar pagamento';
    } catch (e) {
      showError('Erro de rede. Tente novamente.');
      btn.disabled = false;
      btn.textContent = 'Confirmar pagamento';
    }
  });
})();
</script>`;

  return page('Checkout', body, script);
}

/** Non-payable session (expired / completed / failed) — informational state. */
export function renderStatePage(s: PublicSession): string {
  const label = s.expired ? 'EXPIRED' : s.status;
  const messages: Record<string, string> = {
    EXPIRED: 'Esta sessão de pagamento expirou.',
    COMPLETED: 'Este pagamento já foi concluído.',
    FAILED: 'Este pagamento falhou.',
    PROCESSING: 'Este pagamento está a ser processado.',
  };
  return page(
    'Estado',
    `<div class="brand">CoffePay</div>
<div class="card">
  <p class="merchant">Pagamento a <strong>${escapeHtml(s.merchantName)}</strong> · ordem ${escapeHtml(s.orderId)}</p>
  <p class="state">${escapeHtml(label)}</p>
  <p class="usd">${escapeHtml(messages[label] ?? 'Sessão indisponível.')}</p>
</div>`,
  );
}

export function renderNotFound(): string {
  return page(
    'Não encontrado',
    `<div class="brand">CoffePay</div><div class="card"><p>Sessão de pagamento não encontrada.</p></div>`,
  );
}
