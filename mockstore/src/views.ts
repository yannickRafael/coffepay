import { COFFEPAY_LOGO_DATA_URI } from '@coffepay/shared';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// TechStore has its own identity (dark indigo header + coral accent) — clearly a
// different app from CoffePay (navy/slate). Self-contained styles, no framework.
const STYLE = `
:root { --hdr:#1b1b2f; --hdr-ink:#aeb3cc; --accent:#e63956; --bg:#f5f6f8;
  --panel:#ffffff; --ink:#1a2236; --muted:#7a8499; --line:#e6e8ee; --soft:#f1f3f7;
  --ok:#1f9d6b; --ok-bg:#e3f4ec; --coffepay:#1f7a52; --coffepay-dark:#19623f; }
* { box-sizing:border-box; }
body { margin:0; font-family:'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background:var(--bg); color:var(--ink); -webkit-font-smoothing:antialiased; min-height:100vh; }

/* Header */
header.store { background:var(--hdr); color:#fff; }
.hdr-in { max-width:980px; margin:0 auto; display:flex; align-items:center; gap:24px;
  padding:16px 22px; }
.brand-store { font-weight:800; font-size:18px; letter-spacing:.3px; }
nav.menu { display:flex; gap:22px; margin-left:8px; flex:1; }
nav.menu a { color:var(--hdr-ink); text-decoration:none; font-size:14px; font-weight:500; }
nav.menu a.active, nav.menu a:hover { color:#fff; }
.hdr-right { display:flex; align-items:center; gap:18px; color:var(--hdr-ink); font-size:14px; }
.cart { position:relative; }
.cart .badge { position:absolute; top:-8px; right:-10px; background:var(--accent); color:#fff;
  font-size:10px; font-weight:700; width:16px; height:16px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; }

main { max-width:980px; margin:0 auto; padding:28px 22px 56px; }

/* Product layout */
.product { display:grid; grid-template-columns:1fr 1fr; gap:34px; }
@media (max-width:760px){ .product { grid-template-columns:1fr; } }
.gallery .main { aspect-ratio:4/3; border-radius:14px; background:
  linear-gradient(135deg,#dfe6ef,#c4cfdd); display:flex; align-items:center;
  justify-content:center; font-size:96px; }
.thumbs { display:flex; gap:12px; margin-top:14px; }
.thumb { width:72px; height:60px; border-radius:9px; border:2px solid transparent;
  background:linear-gradient(135deg,#e7ecf3,#cfd8e4); cursor:pointer; display:flex;
  align-items:center; justify-content:center; font-size:26px; }
.thumb.active { border-color:var(--ink); }

.cat { display:inline-block; background:var(--accent); color:#fff; font-size:11px;
  font-weight:700; padding:4px 11px; border-radius:20px; text-transform:none; }
h1.title { font-size:28px; margin:12px 0 8px; letter-spacing:-.4px; }
.price { color:var(--accent); font-size:30px; font-weight:800; margin:0 0 10px; }
.rating { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted);
  margin-bottom:14px; }
.stars { color:#f5a623; letter-spacing:1px; font-size:15px; }
.desc { color:#56607a; font-size:14px; line-height:1.6; margin:0 0 18px; }

.qty-label { font-size:13px; font-weight:700; color:var(--ink); }
.qty { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:9px;
  overflow:hidden; margin-left:14px; vertical-align:middle; }
.qty button { width:38px; height:38px; border:0; background:#fff; font-size:18px; cursor:pointer;
  color:var(--ink); }
.qty button:hover { background:var(--soft); }
.qty input { width:46px; height:38px; border:0; border-left:1px solid var(--line);
  border-right:1px solid var(--line); text-align:center; font-size:15px; font-weight:600; }

.hr { height:1px; background:var(--line); margin:22px 0 16px; }
.pm-label { font-size:11px; font-weight:700; letter-spacing:.8px; color:var(--muted);
  margin-bottom:10px; }
.pm-row { display:flex; gap:10px; margin-bottom:18px; }
.pm { padding:9px 16px; border:1px solid var(--line); border-radius:9px; font-size:13px;
  font-weight:600; color:#b3bbc9; background:#fafbfc; cursor:not-allowed; }

.paybtn { display:flex; align-items:center; justify-content:center; gap:10px; width:100%;
  padding:15px; font-size:15.5px; font-weight:700; color:#fff; background:var(--coffepay);
  border:0; border-radius:11px; cursor:pointer; transition:background .15s; }
.paybtn:hover { background:var(--coffepay-dark); }
.paybtn img { width:22px; height:22px; }
.paybtn[disabled] { opacity:.6; cursor:progress; }
.paynote { text-align:center; color:var(--muted); font-size:12px; margin-top:10px; }

/* Confirmation card */
.confirm-wrap { display:flex; justify-content:center; padding:30px 0; }
.confirm { background:var(--panel); border-radius:16px; padding:34px 30px 28px;
  box-shadow:0 14px 40px rgba(26,34,54,.10); width:100%; max-width:480px; text-align:center; }
.confirm .badge { width:64px; height:64px; border-radius:50%; margin:0 auto 16px;
  display:flex; align-items:center; justify-content:center; font-size:32px; }
.confirm .badge.ok { background:var(--ok-bg); color:var(--ok); }
.confirm .badge.bad { background:#fde7e9; color:var(--accent); }
.confirm h2 { font-size:24px; margin:0 0 6px; }
.confirm .sub { color:var(--muted); font-size:14px; margin:0 0 22px; }
.rows { background:var(--soft); border-radius:12px; padding:6px 16px; text-align:left;
  margin-bottom:22px; }
.rows .r { display:flex; justify-content:space-between; align-items:center; padding:13px 0;
  font-size:14px; color:var(--muted); border-bottom:1px solid #e7eaf0; }
.rows .r:last-child { border-bottom:0; }
.rows .r .v { color:var(--ink); font-weight:700; text-align:right; }
.rows .r .v.amount { color:var(--ok); }
.confirm .source { color:#aab2c2; font-size:11.5px; margin:-10px 0 18px; }
.backbtn { display:block; width:100%; padding:14px; font-size:15px; font-weight:700;
  color:var(--ink); background:#fff; border:1px solid #cdd4e0; border-radius:11px;
  cursor:pointer; text-decoration:none; text-align:center; }
.backbtn:hover { background:var(--soft); }
`;

function header(): string {
  return `<header class="store"><div class="hdr-in">
  <div class="brand-store">TechStore</div>
  <nav class="menu">
    <a href="/">Home</a>
    <a href="/" class="active">Laptops</a>
    <a href="/">Phones</a>
    <a href="/">Accessories</a>
    <a href="/">Deals</a>
  </nav>
  <div class="hdr-right">
    <span>Search</span>
    <span class="cart">🛒<span class="badge">1</span></span>
  </div>
</div></header>`;
}

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · TechStore</title>
<style>${STYLE}</style>
</head>
<body>
${header()}
<main>
${body}
</main>
${script}
</body>
</html>`;
}

function stars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let s = '★'.repeat(full);
  if (half) s += '⯨';
  s += '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
  return s;
}

/** Detailed product page with a "Pay with CoffePay" button (opens a popup). */
export function renderProductPage(product: {
  name: string;
  category: string;
  priceUSD: number;
  rating: number;
  reviews: number;
  description: string;
}): string {
  const body = `<div id="store-view" class="product">
  <div class="gallery">
    <div class="main">💻</div>
    <div class="thumbs">
      <div class="thumb active">🖥️</div>
      <div class="thumb">💻</div>
      <div class="thumb">⌨️</div>
      <div class="thumb">🎨</div>
    </div>
  </div>
  <div class="info">
    <span class="cat">${escapeHtml(product.category)}</span>
    <h1 class="title">${escapeHtml(product.name)}</h1>
    <p class="price">$${product.priceUSD.toFixed(2)}</p>
    <div class="rating">
      <span class="stars">${stars(product.rating)}</span>
      <strong>${product.rating}</strong>
      <span>(${product.reviews} reviews)</span>
    </div>
    <p class="desc">${escapeHtml(product.description)}</p>

    <div>
      <span class="qty-label">Quantity:</span>
      <span class="qty">
        <button type="button" id="q-minus" aria-label="decrease">−</button>
        <input id="qty" value="1" inputmode="numeric" readonly />
        <button type="button" id="q-plus" aria-label="increase">+</button>
      </span>
    </div>

    <div class="hr"></div>
    <p class="pm-label">CHOOSE PAYMENT METHOD</p>
    <div class="pm-row">
      <span class="pm">Visa</span>
      <span class="pm">Mastercard</span>
      <span class="pm">PayPal</span>
    </div>
    <button type="button" id="pay-btn" class="paybtn">
      <img src="${COFFEPAY_LOGO_DATA_URI}" alt="" />
      Pay with CoffePay
    </button>
    <p class="paynote">Pay with M-Pesa — no bank card needed</p>
  </div>
</div>`;

  const script = `<script>
(function () {
  var btn = document.getElementById('pay-btn');
  var qtyEl = document.getElementById('qty');
  var popup = null;

  document.getElementById('q-minus').addEventListener('click', function () {
    qtyEl.value = Math.max(1, (parseInt(qtyEl.value, 10) || 1) - 1);
  });
  document.getElementById('q-plus').addEventListener('click', function () {
    qtyEl.value = Math.min(99, (parseInt(qtyEl.value, 10) || 1) + 1);
  });

  function center(w, h) {
    var dl = window.screenLeft != null ? window.screenLeft : screen.left;
    var dt = window.screenTop != null ? window.screenTop : screen.top;
    var vw = window.innerWidth || document.documentElement.clientWidth || screen.width;
    var vh = window.innerHeight || document.documentElement.clientHeight || screen.height;
    return 'width=' + w + ',height=' + h + ',left=' + (dl + (vw - w) / 2) +
      ',top=' + (dt + (vh - h) / 2) +
      ',resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no';
  }

  // The CoffePay popup relays the terminal result; navigate the store tab to the
  // server-rendered confirmation (which has the stored order context).
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.coffepay !== true) { return; }
    if (popup && !popup.closed) { try { popup.close(); } catch (e) {} }
    window.location.href = '/return?session=' + encodeURIComponent(d.sessionId || '') +
      '&status=' + encodeURIComponent(d.status || '');
  });

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    try {
      var r = await fetch('/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ quantity: parseInt(qtyEl.value, 10) || 1 }),
      });
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      var data = await r.json();
      popup = window.open(data.checkoutUrl, 'coffepay-checkout', center(440, 740));
      if (!popup) { window.location.href = data.checkoutUrl; return; }
    } catch (e) {
      alert('Could not start the payment. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });
})();
</script>`;

  return page('TechStore', body, script);
}

/**
 * Confirmation page shown when the customer returns from CoffePay. Inside the
 * popup it relays the result to the store tab and closes (the opener then
 * navigates here as a full page); standalone it renders the full card.
 */
export function renderConfirmationPage(opts: {
  status: string;
  sessionId?: string;
  productName?: string;
  amountUSD?: string;
  amountMZN?: string;
  reference?: string;
  fromWebhook: boolean;
}): string {
  const ok = opts.status === 'COMPLETED';
  const heading = ok ? 'Payment Confirmed!' : `Payment ${opts.status.toLowerCase()}`;
  const sub = ok
    ? 'Your order has been successfully processed'
    : 'Your payment could not be completed';

  let amount = '—';
  if (opts.amountUSD && opts.amountMZN) amount = `$${opts.amountUSD} (${opts.amountMZN} MZN)`;
  else if (opts.amountUSD) amount = `$${opts.amountUSD}`;
  else if (opts.amountMZN) amount = `${opts.amountMZN} MZN`;

  const rows = [
    opts.productName
      ? `<div class="r"><span>Product</span><span class="v">${escapeHtml(opts.productName)}</span></div>`
      : '',
    `<div class="r"><span>Amount</span><span class="v amount">${escapeHtml(amount)}</span></div>`,
    opts.reference
      ? `<div class="r"><span>Reference</span><span class="v">${escapeHtml(opts.reference)}</span></div>`
      : '',
    `<div class="r"><span>Method</span><span class="v">CoffePay via M-Pesa</span></div>`,
  ]
    .filter(Boolean)
    .join('\n      ');

  const source = opts.fromWebhook
    ? 'Confirmed via signed CoffePay webhook'
    : 'Status from redirect — awaiting webhook confirmation';

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
    'Confirmation',
    `<div class="confirm-wrap"><div class="confirm">
  <div class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '!'}</div>
  <h2>${escapeHtml(heading)}</h2>
  <p class="sub">${escapeHtml(sub)}</p>
  <div class="rows">
      ${rows}
  </div>
  <p class="source">${escapeHtml(source)}</p>
  <a class="backbtn" href="/">Back to Store</a>
</div></div>`,
    relay,
  );
}

/** Friendly error page when session creation fails. */
export function renderErrorPage(message: string): string {
  return page(
    'Error',
    `<div class="confirm-wrap"><div class="confirm">
  <div class="badge bad">!</div>
  <h2>Could not start payment</h2>
  <p class="sub">${escapeHtml(message)}</p>
  <a class="backbtn" href="/">Back to Store</a>
</div></div>`,
  );
}
