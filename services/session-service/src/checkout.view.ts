import type { PublicSession } from './session.service.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · CoffePay</title>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

/** Checkout form for a payable (PENDING, not expired) session — RF03. */
export function renderCheckoutPage(s: PublicSession): string {
  return page(
    'Checkout',
    `<h1>CoffePay</h1>
<p>Pagamento a <strong>${escapeHtml(s.merchantName)}</strong> · ordem ${escapeHtml(s.orderId)}</p>
<p>Total: <strong>${escapeHtml(s.amountMZN)} MZN</strong> (${escapeHtml(s.amountUSD)} USD)</p>
<form id="pay-form" method="post" action="/sessions/${escapeHtml(s.sessionId)}/pay">
  <label for="phone">Número de telemóvel (M-Pesa)</label>
  <input id="phone" name="phone" type="tel" inputmode="numeric"
         placeholder="84xxxxxxx" required autocomplete="tel" />
  <button type="submit">Confirmar pagamento</button>
</form>
<p>Expira em ${escapeHtml(s.expiresAt)}</p>`,
  );
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
    `<h1>CoffePay</h1>
<p>Pagamento a <strong>${escapeHtml(s.merchantName)}</strong> · ordem ${escapeHtml(s.orderId)}</p>
<p><strong>${escapeHtml(label)}</strong></p>
<p>${escapeHtml(messages[label] ?? 'Sessão indisponível.')}</p>`,
  );
}

export function renderNotFound(): string {
  return page('Não encontrado', `<h1>CoffePay</h1><p>Sessão de pagamento não encontrada.</p>`);
}
