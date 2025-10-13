import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index.js';
import { logger } from './infra/logger.js';
import { getSecretOrNull } from './infra/keyvault.js';
import { authRateLimiter, proxyRateLimiter } from './infra/rateLimit.js';
import {
  forceHttps,
  hstsHeader,
  ipAllowList,
  pskGuard,
  methodGuard,
  noBodyOnGet,
  requestTimeout,
  correlationId,
} from './security/guards.js';
import { oauthRouter } from './oauth/routes.js';
import { proxyRouter } from './proxy/routes.js';

export function createApp() {
  const app = express();

  // Trust proxy (Azure App Service)
  app.set('trust proxy', 1);

  // Correlation ID (must be first)
  app.use(correlationId);

  // Force HTTPS in production
  app.use(forceHttps);

  // HSTS header
  app.use(hstsHeader);

  // Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for simple HTML responses
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
    })
  );

  // Compression
  app.use(compression());

  // Body parsing with size limits
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '8mb' }));

  // Request timeout
  app.use(requestTimeout(100000)); // 100 seconds

  // Health check endpoint (no auth required)
  app.get('/healthz', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timeUtc: new Date().toISOString(),
      appVersion: config.appVersion,
    });
  });

  // OAuth routes with rate limiting
  app.use('/auth', authRateLimiter, oauthRouter);

  // Proxy routes with security guards
  app.use(
    '/vincere',
    proxyRateLimiter,
    ipAllowList(config.security.allowedIps),
    pskGuard({
      require: config.security.requirePsk,
      getPsk: async () => getSecretOrNull('infra/proxy-psk'),
      allowedIps: config.security.allowedIps,
    }),
    methodGuard,
    noBodyOnGet,
    proxyRouter
  );

  // 404 handler
  app.use((req: Request, res: Response) => {
    logger.warn({ method: req.method, path: req.path }, '404 Not Found');
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error(
      {
        error: err,
        method: req.method,
        path: req.path,
        correlationId: req.correlationId,
      },
      'Unhandled error'
    );

    res.status(500).json({
      error: 'Internal Server Error',
      correlationId: req.correlationId,
    });
  });

  return app;
}

