import express, { type Request, type Response } from 'express';
import { mockstoreConfig } from './config.js';
import { renderProductPage, renderErrorPage } from './views.js';
import { createCoffepaySession, type CreateSessionFn } from './store.js';

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

  // "Pay with CoffePay": create a session and redirect to the CoffePay checkout.
  app.post('/buy', async (_req: Request, res: Response) => {
    const orderId = `order-${Date.now()}`;
    try {
      const session = await createSession({
        orderId,
        amountUSD: cfg.product.priceUSD,
        callbackUrl: `${cfg.publicBaseUrl}/return`,
      });
      res.redirect(302, session.checkoutUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      res.status(502).type('html').send(renderErrorPage(message));
    }
  });

  return app;
}
