import { COFFEPAY_LOGO_DATA_URI } from '@coffepay/shared';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Self-contained stylesheet (no external assets, no framework). The store has
// its own light identity; the "Pay with CoffePay" button carries the CoffePay
// navy brand (#3f5787) + logo so it reads as a third-party pay option.
const STYLE = `
:root { --brand:#3f5787; --brand-dark:#33476f; --bg:#eef1f5; --panel:#ffffff;
  --ink:#1a2236; --muted:#6b7488; --line:#e4e8ef; --ok:#1f7a4d; --err:#c0362c; }
* { box-sizing:border-box; }
body { margin:0; font-family:'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background:var(--bg); color:var(--ink); -webkit-font-smoothing:antialiased;
  min-height:100vh; display:flex; flex-direction:column; }
header.store { background:var(--panel); border-bottom:1px solid var(--line); padding:14px 22px; }
header.store .name { font-weight:700; font-size:17px; letter-spacing:-.2px; }
header.store .tag { color:var(--muted); font-size:12.5px; }
main { flex:1; width:100%; max-width:760px; margin:0 auto; padding:36px 22px 60px; }
.product { background:var(--panel); border:1px solid var(--line); border-radius:18px;
  overflow:hidden; box-shadow:0 10px 30px rgba(26,34,54,.07);
  display:grid; grid-template-columns:1fr 1fr; }
@media (max-width:620px){ .product { grid-template-columns:1fr; } }
.product .media { background:linear-gradient(135deg,#3f5787,#33476f); display:flex;
  align-items:center; justify-content:center; min-height:240px; font-size:84px; }
.product .info { padding:28px 26px; }
.product h2 { margin:0 0 6px; font-size:23px; letter-spacing:-.3px; }
.product .desc { color:var(--muted); font-size:14px; margin:0 0 18px; line-height:1.5; }
.product .price { font-size:30px; font-weight:700; letter-spacing:-.5px; margin:0 0 4px; }
.product .price small { font-size:14px; font-weight:600; color:var(--muted); }
.paybtn { display:inline-flex; align-items:center; justify-content:center; gap:10px;
  width:100%; margin-top:20px; padding:14px 16px; font-size:15px; font-weight:600; color:#fff;
  background:var(--brand); border:0; border-radius:12px; cursor:pointer; transition:background .15s; }
.paybtn:hover { background:var(--brand-dark); }
.paybtn img { width:22px; height:22px; }
.paybtn[disabled] { opacity:.6; cursor:progress; }
.hint { color:var(--muted); font-size:12px; text-align:center; margin-top:12px; }
/* Confirmation / inline result */
.result { background:var(--panel); border:1px solid var(--line); border-radius:18px;
  padding:30px 26px; box-shadow:0 10px 30px rgba(26,34,54,.07); max-width:460px; margin:0 auto;
  text-align:center; }
.result .badge { width:54px; height:54px; border-radius:50%; margin:0 auto 14px;
  display:flex; align-items:center; justify-content:center; font-size:28px; color:#fff; }
.result .badge.ok { background:var(--ok); }
.result .badge.bad { background:var(--err); }
.result h2 { margin:0 0 8px; font-size:21px; }
.result p { color:var(--muted); font-size:14px; margin:4px 0; }
.result code { background:#f2f4f8; padding:2px 6px; border-radius:6px; font-size:12px; }
.result a, .linkbtn { display:inline-block; margin-top:18px; padding:11px 20px; font-size:14px;
  font-weight:600; color:#fff; background:var(--brand); border:0; border-radius:11px;
  text-decoration:none; cursor:pointer; }
.coffepay-by { display:flex; align-items:center; justify-content:center; gap:7px;
  color:var(--muted); font-size:12px; margin-top:20px; }
.coffepay-by img { width:16px; height:16px; }
`;

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · Demo Store</title>
<style>${STYLE}</style>
</head>
<body>
<header class="store">
  <div class="name">Demo Store</div>
  <div class="tag">Loja de demonstração · aceita CoffePay</div>
</header>
<main>
${body}
</main>
${script}
</body>
</html>`;
}

/** Product page with a "Pay with CoffePay" button that opens a popup (fig 27). */
export function renderProductPage(product: { name: string; priceUSD: number }): string {
  const body = `<div id="store-view" class="product">
  <div class="media">☕</div>
  <div class="info">
    <h2>${escapeHtml(product.name)}</h2>
    <p class="desc">Caneca de cerâmica premium da CoffePay. Pague com a sua carteira
      móvel M-Pesa — sem cartão bancário.</p>
    <p class="price">${product.priceUSD.toFixed(2)} <small>USD</small></p>
    <button type="button" id="pay-btn" class="paybtn">
      <img src="${COFFEPAY_LOGO_DATA_URI}" alt="" />
      Pay with CoffePay
    </button>
    <p class="hint">Abre uma janela segura da CoffePay.</p>
  </div>
</div>`;

  const script = `<script>
(function () {
  var btn = document.getElementById('pay-btn');
  var main = document.querySelector('main');
  var popup = null;

  function center(w, h) {
    var dl = window.screenLeft != null ? window.screenLeft : screen.left;
    var dt = window.screenTop != null ? window.screenTop : screen.top;
    var vw = window.innerWidth || document.documentElement.clientWidth || screen.width;
    var vh = window.innerHeight || document.documentElement.clientHeight || screen.height;
    var left = dl + (vw - w) / 2;
    var top = dt + (vh - h) / 2;
    return 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
      ',resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no';
  }

  function showResult(status, amountMZN, sessionId) {
    var ok = status === 'COMPLETED';
    var html = '<div class="result">' +
      '<div class="badge ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓' : '!') + '</div>' +
      '<h2>' + (ok ? 'Pagamento concluído' : 'Pagamento ' + String(status).toLowerCase()) + '</h2>' +
      (amountMZN ? '<p>Montante: <strong>' + amountMZN + ' MZN</strong></p>' : '') +
      (sessionId ? '<p>Sessão: <code>' + sessionId + '</code></p>' : '') +
      '<p>Resultado confirmado pelo webhook assinado do CoffePay.</p>' +
      '<a href="/">Voltar à loja</a>' +
      '<div class="coffepay-by"><img src="${COFFEPAY_LOGO_DATA_URI}" alt="" /> Processado pela CoffePay</div>' +
      '</div>';
    main.innerHTML = html;
  }

  // The CoffePay popup posts the terminal result back to this opener window.
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.coffepay !== true) { return; }
    if (popup && !popup.closed) { try { popup.close(); } catch (e) {} }
    showResult(d.status, d.amountMZN, d.sessionId);
  });

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    try {
      var r = await fetch('/buy', { method: 'POST', headers: { Accept: 'application/json' } });
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      var data = await r.json();
      popup = window.open(data.checkoutUrl, 'coffepay-checkout', center(440, 720));
      if (!popup) { window.location.href = data.checkoutUrl; return; }
    } catch (e) {
      alert('Não foi possível iniciar o pagamento. Tente novamente.');
    } finally {
      btn.disabled = false;
    }
  });
})();
</script>`;

  return page('Demo Store', body, script);
}

/**
 * Confirmation shown when the customer returns from CoffePay (fig 28). When this
 * page loads inside the CoffePay popup, it relays the result to the opener
 * (the store tab) and closes itself — the Google-style popup handshake. As a
 * standalone page (no opener) it renders the full confirmation.
 */
export function renderConfirmationPage(opts: {
  status: string;
  sessionId?: string;
  amountMZN?: string;
  fromWebhook: boolean;
}): string {
  const ok = opts.status === 'COMPLETED';
  const heading = ok ? 'Pagamento concluído' : `Pagamento ${opts.status.toLowerCase()}`;
  const amount = opts.amountMZN
    ? `<p>Montante: <strong>${escapeHtml(opts.amountMZN)} MZN</strong></p>`
    : '';
  const source = opts.fromWebhook
    ? '<p>Resultado confirmado pelo webhook assinado do CoffePay.</p>'
    : '<p>Webhook ainda não recebido; estado obtido do redirect.</p>';

  const relay = `<script>
(function () {
  var payload = {
    coffepay: true,
    status: ${JSON.stringify(opts.status)},
    sessionId: ${JSON.stringify(opts.sessionId ?? '')},
    amountMZN: ${JSON.stringify(opts.amountMZN ?? '')}
  };
  if (window.opener && window.opener !== window) {
    try { window.opener.postMessage(payload, '*'); } catch (e) {}
    setTimeout(function () { window.close(); }, 400);
  }
})();
</script>`;

  return page(
    'Confirmação',
    `<div class="result">
  <div class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '!'}</div>
  <h2>${escapeHtml(heading)}</h2>
  ${opts.sessionId ? `<p>Sessão: <code>${escapeHtml(opts.sessionId)}</code></p>` : ''}
  ${amount}
  ${source}
  <a href="/">Voltar à loja</a>
  <div class="coffepay-by"><img src="${COFFEPAY_LOGO_DATA_URI}" alt="" /> Processado pela CoffePay</div>
</div>`,
    relay,
  );
}

/** Friendly error page when session creation fails. */
export function renderErrorPage(message: string): string {
  return page(
    'Erro',
    `<div class="result">
  <div class="badge bad">!</div>
  <h2>Não foi possível iniciar o pagamento</h2>
  <p><em>${escapeHtml(message)}</em></p>
  <a href="/">Voltar à loja</a>
</div>`,
  );
}
