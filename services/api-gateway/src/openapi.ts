/**
 * OpenAPI 3 document for the CoffePay public (merchant-facing) API exposed by
 * the gateway (T39). Authored explicitly so it is robust at runtime/in Docker
 * (no source-file scanning).
 */
export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CoffePay API',
    version: '1.0.0',
    description:
      'Interoperability gateway between Mozambican mobile wallets (M-Pesa) and ' +
      'international payment ecosystems. This document covers the merchant-facing ' +
      'gateway surface.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local' }],
  components: {
    securitySchemes: {
      ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      AdminKey: { type: 'apiKey', in: 'header', name: 'X-Admin-Key' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string' },
          details: {},
        },
        required: ['code', 'message'],
      },
      TokenResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'string', example: '15m' },
        },
      },
      CreateSessionRequest: {
        type: 'object',
        required: ['orderId', 'amountUSD', 'callbackUrl'],
        properties: {
          orderId: { type: 'string', example: 'order-123' },
          amountUSD: { type: 'number', example: 10 },
          callbackUrl: { type: 'string', format: 'uri', example: 'https://store.example/return' },
        },
      },
      SessionResult: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          status: { type: 'string', example: 'PENDING' },
          amountUSD: { type: 'string', example: '10' },
          amountMZN: { type: 'string', example: '651.41' },
          rate: { type: 'string', example: '63.552267' },
          checkoutUrl: { type: 'string', format: 'uri' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/v1/auth/token': {
      post: {
        summary: 'Exchange an API key for a short-lived JWT',
        security: [{ ApiKey: [] }],
        responses: {
          '200': {
            description: 'Token issued',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } },
            },
          },
          '401': {
            description: 'Invalid or missing API key',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/v1/sessions/create': {
      post: {
        summary: 'Create a payment session',
        security: [{ ApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateSessionRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Session created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionResult' } },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/admin/dlq/{queue}': {
      get: {
        summary: 'List dead-lettered jobs (operational)',
        security: [{ AdminKey: [] }],
        parameters: [
          { name: 'queue', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'start', in: 'query', schema: { type: 'integer' } },
          { name: 'end', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Dead letters' }, '401': { description: 'Denied' } },
      },
    },
    '/admin/dlq/{queue}/{id}/reprocess': {
      post: {
        summary: 'Reprocess a dead-lettered job (operational)',
        security: [{ AdminKey: [] }],
        parameters: [
          { name: 'queue', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Reprocessed' },
          '401': { description: 'Denied' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/admin/settlements/run': {
      post: {
        summary: 'Run the periodic merchant settlement on-demand (operational)',
        security: [{ AdminKey: [] }],
        responses: {
          '200': { description: 'Settlements processed' },
          '401': { description: 'Denied' },
        },
      },
    },
    '/admin/settlements': {
      get: {
        summary: 'List settlements (operational)',
        security: [{ AdminKey: [] }],
        parameters: [{ name: 'merchantId', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Settlements' }, '401': { description: 'Denied' } },
      },
    },
  },
} as const;
