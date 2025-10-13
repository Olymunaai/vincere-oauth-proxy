import pino from 'pino';
import { config } from '../config/index.js';

const isProduction = config.nodeEnv === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-proxy-token"]',
      'req.headers["id-token"]',
      'req.headers["x-api-key"]',
      'res.headers.authorization',
      'res.headers["id-token"]',
      'res.headers["x-api-key"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.access_token',
      '*.refresh_token',
      '*.id_token',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.headers,
    }),
    err: pino.stdSerializers.err,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
});

export function createRequestLogger(correlationId: string) {
  return logger.child({ correlationId });
}

