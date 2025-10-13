import { Request, Response, NextFunction } from 'express';
import { logger } from '../infra/logger.js';
import { validateMethod } from './validators.js';

/**
 * Forces HTTPS in production
 */
export function forceHttps(req: Request, res: Response, next: NextFunction): void {
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    return next();
  }

  if (process.env.NODE_ENV === 'production') {
    logger.warn({ url: req.url, ip: req.ip }, 'Rejecting non-HTTPS request');
    res.status(403).json({ error: 'HTTPS required' });
    return;
  }

  next();
}

/**
 * Adds HSTS header
 */
export function hstsHeader(req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  next();
}

/**
 * IP allow-list guard
 */
export function ipAllowList(allowedIps: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (allowedIps.length === 0) {
      // No restriction
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || '';

    if (allowedIps.includes(clientIp)) {
      return next();
    }

    logger.warn({ clientIp, allowedIps }, 'IP not in allow-list');
    res.status(403).json({ error: 'Forbidden' });
  };
}

/**
 * Pre-shared key (PSK) authentication guard
 */
export function pskGuard(opts: {
  require: boolean;
  getPsk: () => Promise<string | null>;
  allowedIps: string[];
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientIp = req.ip || req.socket.remoteAddress || '';
    const ipOk = opts.allowedIps.length === 0 || opts.allowedIps.includes(clientIp);

    // If PSK not required and IP is ok, allow through
    if (!opts.require && ipOk) {
      return next();
    }

    // If IP check fails
    if (!ipOk) {
      logger.warn({ clientIp }, 'IP check failed');
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // PSK not required, IP ok
    if (!opts.require) {
      return next();
    }

    // PSK required - validate token
    try {
      const expected = await opts.getPsk();
      const got = req.header('X-Proxy-Token');

      if (!expected) {
        logger.error('PSK not configured in Key Vault');
        res.status(500).json({ error: 'PSK check failed' });
        return;
      }

      if (got !== expected) {
        logger.warn({ clientIp }, 'Invalid PSK token');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      return next();
    } catch (error) {
      logger.error({ error }, 'PSK check failed');
      res.status(500).json({ error: 'PSK check failed' });
    }
  };
}

/**
 * HTTP method guard
 */
export function methodGuard(req: Request, res: Response, next: NextFunction): void {
  const validation = validateMethod(req.method);

  if (!validation.valid) {
    logger.warn({ method: req.method, path: req.path }, 'Method not allowed');
    res.status(405).json({ error: validation.error });
    return;
  }

  next();
}

/**
 * Deny body on GET requests
 */
export function noBodyOnGet(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' && req.headers['content-length'] && req.headers['content-length'] !== '0') {
    logger.warn({ path: req.path }, 'GET request with body rejected');
    res.status(400).json({ error: 'GET requests cannot have a body' });
    return;
  }

  next();
}

/**
 * Request timeout guard
 */
export function requestTimeout(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.setTimeout(timeoutMs, () => {
      logger.warn({ path: req.path, timeout: timeoutMs }, 'Request timeout');
      res.status(408).json({ error: 'Request timeout' });
    });

    next();
  };
}

/**
 * Correlation ID middleware
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = req.header('x-correlation-id') || 
              req.header('x-request-id') || 
              crypto.randomUUID();
  
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

