import express, { type Request, type Response } from 'express';
import { verifySignature, SIGNATURE_HEADER } from '@coffepay/shared';
import { mockstoreConfig } from './config.js';
import { renderProductPage, renderErrorPage, renderConfirmationPage } from './views.js';
import { createCoffepaySession, type CreateSessionFn } from './store.js';
import { recordEvent, getEvent, type ReceivedEvent } from './events.js';
import { setOrder, getOrder } from './orders.js';

export interface MockstoreDeps {
  createSession?: CreateSessionFn;
}

export function createApp(deps: MockstoreDeps = {}) {
  const cfg = mockstoreConfig();
  const createSession = deps.createSession ?? createCoffepaySession;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(renderProductPage(cfg.product));
  });

  // CoffePay webhook receiver (RF15). Verify the HMAC over the RAW body (not a
  // re-serialized object), store the event, respond 2xx. Bad signature → 401 so
  // the emitter retries (T25 retry/DLQ).
  app.post('/webhooks/coffepay', express.raw({ type: '*/*' }), (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const header = req.headers[SIGNATURE_HEADER.toLowerCase()];
    if (typeof header !== 'string' || !verifySignature(raw, header, cfg.webhookSecret)) {
      res.status(401).json({ error: 'invalid signature' });
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'invalid json' });
      return;
    }
    const event: ReceivedEvent = {
      event: String(parsed.event ?? ''),
      sessionId: parsed.sessionId ? String(parsed.sessionId) : undefined,
      paymentId: parsed.paymentId ? String(parsed.paymentId) : undefined,
      status: parsed.status ? String(parsed.status) : undefined,
      amountMZN: parsed.amountMZN ? String(parsed.amountMZN) : undefined,
      receivedAt: new Date().toISOString(),
    };
    recordEvent(event);
    res.status(200).json({ received: true });
  });

  // Customer returns from CoffePay (T26): ?session=&status=. Prefer the verified
  // webhook result if we already have it; otherwise fall back to the query.
  app.get('/return', (req: Request, res: Response) => {
    const sessionId = typeof req.query.session === 'string' ? req.query.session : undefined;
    const queryStatus = typeof req.query.status === 'string' ? req.query.status : 'UNKNOWN';
    const hook = sessionId ? getEvent(sessionId) : undefined;
    const order = sessionId ? getOrder(sessionId) : undefined;
    res.type('html').send(
      renderConfirmationPage({
        status: hook?.status ?? queryStatus,
        sessionId,
        productName: order?.productName,
        amountUSD: order?.amountUSD,
        amountMZN: hook?.amountMZN ?? order?.amountMZN,
        reference: hook?.paymentId ?? sessionId,
        fromWebhook: Boolean(hook),
      }),
    );
  });

  // "Pay with CoffePay": create a session. Called by fetch (Accept: json) from
  // the product page, which opens the checkout in a popup → returns JSON. Falls
  // back to a 302 redirect for a plain (no-JS) form post.
  app.post('/buy', express.json(), async (req: Request, res: Response) => {
    const orderId = `order-${Date.now()}`;
    const wantsJson = (req.headers.accept ?? '').includes('application/json');
    const qtyRaw = Number((req.body as { quantity?: unknown })?.quantity ?? 1);
    const quantity = Number.isFinite(qtyRaw) ? Math.min(Math.max(Math.trunc(qtyRaw), 1), 99) : 1;
    const amountUSD = Number((cfg.product.priceUSD * quantity).toFixed(2));
    try {
      const session = await createSession({
        orderId,
        amountUSD,
        callbackUrl: `${cfg.publicBaseUrl}/return`,
      });
      if (session.sessionId) {
        setOrder(session.sessionId, {
          productName: cfg.product.name,
          amountUSD: amountUSD.toFixed(2),
          amountMZN: session.amountMZN,
        });
      }
      if (wantsJson) {
        res.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId });
        return;
      }
      res.redirect(302, session.checkoutUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      if (wantsJson) {
        res.status(502).json({ error: message });
        return;
      }
      res.status(502).type('html').send(renderErrorPage(message));
    }
  });

  return app;
}
