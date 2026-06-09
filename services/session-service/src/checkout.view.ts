import { COFFEPAY_LOGO_DATA_URI } from '@coffepay/shared';
import type { PublicSession } from './session.service.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Money formatting: thousands separator + 2 decimals (e.g. 19,247.55). */
function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Embedded stylesheet (no external assets, no framework) — RNF08. Palette and
// typography mirror the Coffebit brand: navy/slate (#3f5787), light neutral
// background, crisp white card, restrained geometric look.
const STYLE = `
:root { --brand:#3f5787; --brand-dark:#33476f; --bg:#eef1f5; --panel:#ffffff;
  --ink:#1a2236; --muted:#7a8499; --line:#e4e8ef; --soft:#f4f6f9; --err:#c0362c;
  --info-bg:#eef3fb; --info-ink:#33476f; }
* { box-sizing: border-box; }
html, body { height:100%; }
body { margin:0; font-family:'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background:var(--bg); color:var(--ink); -webkit-font-smoothing:antialiased;
  display:flex; align-items:flex-start; justify-content:center; }
main { width:100%; max-width:440px; padding:18px 20px 32px; }

/* Top bar: back link · brand · step indicator */
.topbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:4px 0 14px; }
.back { color:var(--muted); font-size:12.5px; text-decoration:none; white-space:nowrap; }
.back:hover { color:var(--brand); }
.brand { display:flex; align-items:center; gap:7px; }
.brand img { width:24px; height:24px; display:block; }
.brand span { font-weight:700; color:var(--brand); font-size:16px; letter-spacing:-.2px; }
.steps { display:flex; align-items:center; gap:5px; margin-left:auto; }
.steps .dot { width:22px; height:22px; border-radius:50%; background:#dde3ec; color:#9aa3b5;
  font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.steps .dot.on { background:var(--brand); color:#fff; }
.steps .bar { width:14px; height:2px; background:#dde3ec; }
.steps .bar.on { background:var(--brand); }
.steps .frac { color:var(--muted); font-size:12px; margin-left:4px; }

.card { background:var(--panel); border:1px solid var(--line); border-radius:16px;
  padding:20px; box-shadow:0 8px 24px rgba(26,34,54,.06); }
h2.title { font-size:20px; margin:6px 2px 14px; letter-spacing:-.3px; }

/* Summary block (grey) */
.summary { background:var(--soft); border-radius:12px; padding:16px 16px 14px; }
.row { display:flex; justify-content:space-between; align-items:center; font-size:14px;
  color:var(--muted); padding:5px 0; }
.row .v { color:var(--ink); font-weight:600; }
.row .tag { color:var(--muted); font-size:11px; background:#e7ebf2; padding:2px 7px;
  border-radius:6px; font-weight:600; margin-left:6px; }
.sep { height:1px; background:#dfe4ec; margin:8px 0; }
.bigrow { display:flex; justify-content:space-between; align-items:flex-end; padding-top:4px; }
.bigrow .lbl { color:var(--muted); font-size:14px; }
.bigrow .amt { color:var(--brand); font-size:26px; font-weight:700; letter-spacing:-.5px; }
.fxnote { text-align:right; color:#aab2c2; font-size:11.5px; margin:4px 0 0; }

/* Wallet selector */
.field-label { font-size:13.5px; font-weight:600; margin:18px 2px 8px; }
.wallets { display:flex; gap:0; border:1px solid #cdd4e0; border-radius:11px; overflow:hidden; }
.wallet { flex:1; text-align:center; padding:12px 6px; font-size:14px; font-weight:600;
  background:#fff; color:var(--ink); cursor:pointer; border:0; border-right:1px solid #e4e8ef;
  position:relative; }
.wallet:last-child { border-right:0; }
.wallet.active { background:var(--brand); color:#fff; }
.wallet[disabled] { color:#b3bbc9; cursor:not-allowed; background:#f7f8fb; }
.wallet small { display:block; font-size:9.5px; font-weight:600; opacity:.85; margin-top:1px; }

/* Phone input */
.phone-wrap { display:flex; gap:8px; }
.country { display:flex; align-items:center; gap:5px; padding:0 12px; border:1px solid #cdd4e0;
  border-radius:11px; background:#fbfcfe; font-size:14px; font-weight:600; color:var(--ink); }
input[type=tel] { flex:1; padding:13px; font-size:16px; border:1px solid #cdd4e0;
  border-radius:11px; background:#fbfcfe; transition:border-color .15s, box-shadow .15s; }
input[type=tel]:focus { outline:none; border-color:var(--brand);
  box-shadow:0 0 0 3px rgba(63,87,135,.16); }
.error { color:var(--err); font-size:13px; min-height:18px; margin:8px 2px 0; }

/* Buttons */
button.primary { width:100%; margin-top:18px; padding:14px; font-size:15.5px; font-weight:600;
  color:#fff; background:var(--brand); border:0; border-radius:11px; cursor:pointer;
  transition:background .15s; }
button.primary:hover { background:var(--brand-dark); }
button.primary[disabled] { opacity:.6; cursor:progress; }
.btn-row { display:flex; gap:12px; margin-top:18px; }
.btn-row .ghost { flex:0 0 38%; padding:14px; font-size:15px; font-weight:600; color:var(--ink);
  background:#fff; border:1px solid #cdd4e0; border-radius:11px; cursor:pointer; }
.btn-row .primary { flex:1; margin-top:0; }
button.cancel { display:block; margin:18px auto 0; padding:11px 28px; font-size:14px;
  font-weight:600; color:var(--ink); background:#fff; border:1px solid #cdd4e0;
  border-radius:11px; cursor:pointer; }

/* Info banner */
.info { display:flex; gap:9px; background:var(--info-bg); color:var(--info-ink);
  border-radius:11px; padding:13px 14px; font-size:13px; line-height:1.45; margin-top:16px; }
.info .i { font-weight:700; }

/* Awaiting */
.await { text-align:center; padding:14px 0 4px; }
.spinner { width:54px; height:54px; margin:8px auto 18px; border:4px solid var(--line);
  border-top-color:var(--brand); border-radius:50%; animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.await h2 { font-size:21px; margin:0 0 10px; }
.await p { color:var(--muted); font-size:14px; margin:4px 0; }
.await .timer { display:inline-flex; align-items:center; gap:6px; background:var(--soft);
  color:var(--muted); font-size:13px; padding:7px 14px; border-radius:20px; margin:10px 0 6px; }
.state { font-size:19px; font-weight:700; margin:0 0 6px; }

.secure { display:flex; align-items:center; justify-content:center; gap:6px;
  color:var(--muted); font-size:11.5px; margin-top:16px; }
.hidden { display:none !important; }
`;

// Top bar with the step indicator (steps updated client-side via data-step).
function topBar(backLabel: string): string {
  return `<div class="topbar">
  <a class="back" href="#" id="back-link">← Back to ${escapeHtml(backLabel)}</a>
  <div class="brand"><img src="${COFFEPAY_LOGO_DATA_URI}" alt="" /><span>CoffePay</span></div>
  <div class="steps" id="steps">
    <span class="dot on" data-d="1">1</span><span class="bar" data-b="1"></span>
    <span class="dot" data-d="2">2</span><span class="bar" data-b="2"></span>
    <span class="dot" data-d="3">3</span>
    <span class="frac" id="frac">1/3</span>
  </div>
</div>`;
}

const FOOTER = `<p class="secure">🔒 Secure Payment — CoffePay</p>`;

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
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

export interface CheckoutPollOptions {
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

const DEFAULT_POLL: CheckoutPollOptions = { pollIntervalMs: 3000, pollTimeoutMs: 150000 };

/**
 * Three-step checkout wizard for a payable (PENDING, not expired) session
 * (RF03 / RNF08): 1) details + wallet + phone, 2) confirm fee/total,
 * 3) awaiting M-Pesa PIN authorization (polling). Only M-Pesa is enabled;
 * E-Mola and mKesh are shown disabled (not yet supported).
 */
export function renderCheckoutPage(
  s: PublicSession,
  poll: CheckoutPollOptions = DEFAULT_POLL,
): string {
  const sid = escapeHtml(s.sessionId);
  const total = Number(s.amountMZN);
  const fee = Number(s.fee);
  const base = total - fee;
  const feePct = base > 0 ? (fee / base) * 100 : 0;
  const usd = `$${escapeHtml(s.amountUSD)}`;
  const merchant = escapeHtml(s.merchantName);
  const rate = escapeHtml(s.rate);

  const body = `${topBar(s.merchantName)}
<div class="card" data-session-id="${sid}">

  <!-- STEP 1 — details -->
  <section id="step-1">
    <div class="summary">
      <div class="row"><span>Paying to</span><span class="v">${merchant}</span></div>
      <div class="row"><span>Amount</span><span class="v">${usd}</span></div>
      <div class="sep"></div>
      <div class="bigrow"><span class="lbl">You pay</span><span class="amt">${money(base)} MZN</span></div>
      <p class="fxnote">1 USD = ${rate} MZN</p>
    </div>

    <p class="field-label">Mobile Wallet</p>
    <div class="wallets">
      <button type="button" class="wallet active" data-wallet="mpesa">M-Pesa</button>
      <button type="button" class="wallet" disabled>E-Mola<small>em breve</small></button>
      <button type="button" class="wallet" disabled>mKesh<small>em breve</small></button>
    </div>

    <p class="field-label">Phone Number</p>
    <div class="phone-wrap">
      <span class="country">🇲🇿 MZ</span>
      <input id="phone" name="phone" type="tel" inputmode="numeric"
             placeholder="+258 84 XXX XXXX" required autocomplete="tel"
             aria-describedby="phone-error" />
    </div>
    <p id="phone-error" class="error" role="alert" aria-live="polite"></p>

    <button type="button" class="primary" id="continue-btn">Continue</button>
  </section>

  <!-- STEP 2 — confirm -->
  <section id="step-2" class="hidden">
    <h2 class="title">Confirm Payment</h2>
    <div class="summary">
      <div class="row"><span>Phone</span><span class="v"><span id="cf-phone"></span><span class="tag">M-Pesa</span></span></div>
      <div class="row"><span>Amount</span><span class="v">${usd}</span></div>
      <div class="row"><span>Fee</span><span class="v">${money(fee)} MZN (${feePct.toFixed(1)}%)</span></div>
      <div class="sep"></div>
      <div class="bigrow"><span class="lbl">Total</span><span class="amt">${money(total)} MZN</span></div>
      <p class="fxnote">1 USD = ${rate} MZN</p>
    </div>
    <div class="info"><span class="i">ⓘ</span><span>After confirming, you will receive a
      notification to authorize with your M-Pesa PIN.</span></div>
    <div class="btn-row">
      <button type="button" class="ghost" id="back-btn">Back</button>
      <button type="button" class="primary" id="confirm-btn">Confirm &amp; Pay</button>
    </div>
  </section>

  <!-- STEP 3 — awaiting -->
  <section id="step-3" class="hidden">
    <div class="await">
      <div class="spinner"></div>
      <h2>Awaiting Confirmation</h2>
      <p>Notification sent to <strong id="aw-phone"></strong>.<br/>Enter your M-Pesa PIN to confirm.</p>
      <div class="timer">🕐 <span id="countdown"></span></div>
      <p class="fxnote" style="text-align:center">${money(total)} MZN — ${merchant}</p>
      <button type="button" class="cancel" id="cancel-btn">Cancel</button>
    </div>
  </section>

</div>
${FOOTER}`;

  const script = `<script>
(function () {
  var sid = ${JSON.stringify(s.sessionId)};
  var returnUrl = '/checkout/' + sid + '/return';
  var pollInterval = ${JSON.stringify(poll.pollIntervalMs)};
  var pollTimeout = ${JSON.stringify(poll.pollTimeoutMs)};
  var idemKey = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

  var phone = document.getElementById('phone');
  var err = document.getElementById('phone-error');
  var continueBtn = document.getElementById('continue-btn');
  var backBtn = document.getElementById('back-btn');
  var confirmBtn = document.getElementById('confirm-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var backLink = document.getElementById('back-link');
  var canonicalPhone = '';

  function showError(m) { err.textContent = m || ''; }

  // Step indicator + section visibility.
  function setStep(n) {
    document.getElementById('frac').textContent = n + '/3';
    var dots = document.querySelectorAll('#steps .dot');
    var bars = document.querySelectorAll('#steps .bar');
    dots.forEach(function (d) { d.classList.toggle('on', Number(d.getAttribute('data-d')) <= n); });
    bars.forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-b')) < n); });
    for (var i = 1; i <= 3; i++) {
      var sec = document.getElementById('step-' + i);
      if (sec) { sec.classList.toggle('hidden', i !== n); }
    }
  }

  async function validatePhone() {
    showError('');
    var value = (phone.value || '').trim();
    if (!value) { showError('Enter your phone number.'); return false; }
    try {
      var r = await fetch('/sessions/' + sid + '/validate-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value }),
      });
      if (r.ok) {
        var ok = await r.json().catch(function () { return {}; });
        canonicalPhone = ok.msisdn || value;
        return true;
      }
      var b = await r.json().catch(function () { return {}; });
      showError(b.message || 'Invalid number. Use a Mozambican M-Pesa number.');
      return false;
    } catch (e) {
      showError('Could not validate the number. Try again.');
      return false;
    }
  }

  // Display helper: show the canonical MSISDN as +258 ...
  function prettyPhone(p) {
    var d = String(p).replace(/[^0-9]/g, '');
    if (d.indexOf('258') === 0) { d = d.slice(3); }
    return '+258 ' + d;
  }

  // STEP 1 → 2
  continueBtn.addEventListener('click', async function () {
    continueBtn.disabled = true;
    var ok = await validatePhone();
    continueBtn.disabled = false;
    if (!ok) { phone.focus(); return; }
    document.getElementById('cf-phone').textContent = prettyPhone(canonicalPhone);
    setStep(2);
  });

  // STEP 2 → 1
  backBtn.addEventListener('click', function () { setStep(1); });

  // STEP 2 → pay → 3
  confirmBtn.addEventListener('click', async function () {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing…';
    try {
      var r = await fetch('/sessions/' + sid + '/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
        body: JSON.stringify({ phone: canonicalPhone }),
      });
      if (r.status === 202) {
        document.getElementById('aw-phone').textContent = prettyPhone(canonicalPhone);
        setStep(3);
        startCountdown();
        startPolling();
        return;
      }
      var b = await r.json().catch(function () { return {}; });
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Pay';
      setStep(1);
      showError(b.message || 'Could not start the payment.');
    } catch (e) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Pay';
      setStep(1);
      showError('Network error. Try again.');
    }
  });

  // Cancel / back-to-store
  cancelBtn.addEventListener('click', function () { window.location.href = returnUrl; });
  backLink.addEventListener('click', function (ev) { ev.preventDefault(); window.location.href = returnUrl; });

  // STEP 3 — countdown (visual) tied to the poll timeout.
  function startCountdown() {
    var deadline = Date.now() + pollTimeout;
    var el = document.getElementById('countdown');
    function tick() {
      var left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      if (el) { el.textContent = left + ' seconds remaining'; }
      if (left > 0) { setTimeout(tick, 1000); }
    }
    tick();
  }

  // STEP 3 — terminal result replaces the card, then returns to the store.
  function showResult(status) {
    var main = document.querySelector('main');
    var msg;
    if (status === 'COMPLETED') {
      msg = '<p class="state">Payment complete ✓</p><p class="fxnote" style="text-align:center">Redirecting to the store…</p>';
    } else if (status === 'EXPIRED') {
      msg = '<p class="state">Session expired</p><p class="fxnote" style="text-align:center">The payment window closed. Start again from the store.</p>';
    } else {
      msg = '<p class="state">Payment not completed</p><p class="fxnote" style="text-align:center">The payment failed. You can try again from the store.</p>';
    }
    main.innerHTML = '<div class="card"><div class="await">' + msg +
      '<button type="button" class="cancel" id="go">Back to store</button></div></div>' +
      ${JSON.stringify(FOOTER)};
    var go = document.getElementById('go');
    if (go) { go.addEventListener('click', function () { window.location.href = returnUrl; }); }
    setTimeout(function () { window.location.href = returnUrl; }, 2500);
  }

  function isTerminal(status) {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'EXPIRED';
  }

  function startPolling() {
    var deadline = Date.now() + pollTimeout;
    function tick() {
      fetch('/sessions/' + sid, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (st) {
          var status = st ? (st.expired ? 'EXPIRED' : st.status) : null;
          if (status && isTerminal(status)) { showResult(status); return; }
          if (Date.now() >= deadline) { showResult('FAILED'); return; }
          setTimeout(tick, pollInterval);
        })
        .catch(function () { setTimeout(tick, pollInterval); });
    }
    setTimeout(tick, pollInterval);
  }
})();
</script>`;

  return page('Checkout', body, script);
}

/** Non-payable session (expired / completed / failed) — informational state. */
export function renderStatePage(s: PublicSession): string {
  const label = s.expired ? 'EXPIRED' : s.status;
  const messages: Record<string, string> = {
    EXPIRED: 'This payment session has expired.',
    COMPLETED: 'This payment has already been completed.',
    FAILED: 'This payment failed.',
    PROCESSING: 'This payment is being processed.',
  };
  return page(
    'Status',
    `${topBar(s.merchantName)}
<div class="card">
  <div class="await">
    <p class="state">${escapeHtml(label)}</p>
    <p class="fxnote" style="text-align:center">${escapeHtml(messages[label] ?? 'Session unavailable.')}</p>
  </div>
</div>
${FOOTER}`,
  );
}

export function renderNotFound(): string {
  return page(
    'Not found',
    `<div class="card"><div class="await"><p class="state">Payment session not found.</p></div></div>
${FOOTER}`,
  );
}
