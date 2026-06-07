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
<title>${escapeHtml(title)} · Demo Store</title>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

/** Product page with a "Pay with CoffePay" button (fig 27). */
export function renderProductPage(product: { name: string; priceUSD: number }): string {
  return page(
    'Demo Store',
    `<h1>Demo Store</h1>
<section>
  <h2>${escapeHtml(product.name)}</h2>
  <p>Preço: <strong>${product.priceUSD.toFixed(2)} USD</strong></p>
  <form method="post" action="/buy">
    <button type="submit">Pay with CoffePay</button>
  </form>
</section>`,
  );
}

/** Confirmation page shown when the customer returns from CoffePay (fig 28). */
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
    ? '<p><small>Resultado confirmado pelo webhook assinado do CoffePay.</small></p>'
    : '<p><small>Webhook ainda não recebido; estado obtido do redirect.</small></p>';
  return page(
    'Confirmação',
    `<h1>Demo Store</h1>
<h2>${escapeHtml(heading)}</h2>
${opts.sessionId ? `<p>Sessão: <code>${escapeHtml(opts.sessionId)}</code></p>` : ''}
${amount}
${source}
<p><a href="/">Voltar à loja</a></p>`,
  );
}

/** Friendly error page when session creation fails. */
export function renderErrorPage(message: string): string {
  return page(
    'Erro',
    `<h1>Demo Store</h1>
<p>Não foi possível iniciar o pagamento.</p>
<p><em>${escapeHtml(message)}</em></p>
<p><a href="/">Voltar à loja</a></p>`,
  );
}
