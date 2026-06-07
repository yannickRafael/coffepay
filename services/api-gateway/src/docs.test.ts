import request from 'supertest';
import { createApp } from './app.js';
import { gatewayConfig } from './config.js';

const app = createApp(gatewayConfig());

describe('API docs (T39)', () => {
  test('GET /openapi.json returns a valid OpenAPI 3 document', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('CoffePay API');
    expect(res.body.paths).toHaveProperty('/api/v1/sessions/create');
    expect(res.body.paths).toHaveProperty('/api/v1/auth/token');
    expect(res.body.components.securitySchemes).toHaveProperty('ApiKey');
  });

  test('GET /docs serves the Swagger UI', async () => {
    const res = await request(app).get('/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });
});
