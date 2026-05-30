import pino, { type Logger } from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const isProd = process.env.NODE_ENV === 'production';

// JSON in production; human-readable (pino-pretty) in dev.
export const logger: Logger = pino({
  level,
  base: { service: process.env.SERVICE_NAME },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }),
});

/** Child logger with fixed bindings (e.g. a requestId or service name). */
export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
