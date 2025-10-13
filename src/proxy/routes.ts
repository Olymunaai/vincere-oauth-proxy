import { Router, Request, Response } from 'express';
import { createRequestLogger } from '../infra/logger.js';
import { trackEvent, trackMetric } from '../infra/appInsights.js';
import { validateTenantHost, validatePath, sanitizeQueryParams } from '../security/validators.js';
import { callVincereApi, extractRowCount } from './vincereClient.js';

export const proxyRouter = Router();

/**
 * Proxy all requests to Vincere
 * ALL /vincere/:tenantHost/*
 */
proxyRouter.all('/:tenantHost/*', async (req: Request, res: Response) => {
  const reqLogger = createRequestLogger(req.correlationId || 'unknown');
  const { tenantHost } = req.params;
  const path = req.params[0]; // Wildcard capture
  const method = req.method as 'GET' | 'POST';

  reqLogger.info({ tenantHost, path, method }, 'Proxy request received');

  // Validate tenant host
  const hostValidation = validateTenantHost(tenantHost);
  if (!hostValidation.valid) {
    reqLogger.warn({ tenantHost, error: hostValidation.error }, 'Invalid tenant host');
    trackEvent('proxy_request_failed', { reason: 'invalid_host' });
    res.status(400).json({ error: hostValidation.error });
    return;
  }

  // Validate path
  const pathValidation = validatePath(path);
  if (!pathValidation.valid) {
    reqLogger.warn({ path, error: pathValidation.error }, 'Invalid path');
    trackEvent('proxy_request_failed', { reason: 'invalid_path' });
    res.status(400).json({ error: pathValidation.error });
    return;
  }

  try {
    // Sanitize query parameters
    const query = sanitizeQueryParams(req.query as Record<string, unknown>);

    // Call Vincere API
    const response = await callVincereApi({
      tenantHost,
      path,
      method,
      query,
      body: method === 'POST' ? req.body : undefined,
    });

    // Extract row count if available
    const rowCount = extractRowCount(response.data);

    // Log metrics
    trackMetric('proxy_request_duration_ms', response.durationMs);
    if (rowCount !== undefined) {
      trackMetric('proxy_response_row_count', rowCount);
    }

    trackEvent('proxy_request_success', {
      tenant: tenantHost,
      path,
      method,
      status: String(response.status),
    });

    reqLogger.info(
      {
        tenantHost,
        path,
        method,
        status: response.status,
        durationMs: response.durationMs,
        rowCount,
      },
      'Proxy request completed'
    );

    // Add custom headers
    res.setHeader('x-proxy-tenant', tenantHost);
    res.setHeader('x-proxy-target', `https://${tenantHost}/api/v2/${path}`);
    res.setHeader('x-proxy-duration-ms', String(response.durationMs));
    if (rowCount !== undefined) {
      res.setHeader('x-proxy-row-count', String(rowCount));
    }

    // Return response
    res.status(response.status).json(response.data);
  } catch (error) {
    reqLogger.error({ error, tenantHost, path, method }, 'Proxy request failed');
    trackEvent('proxy_request_failed', {
      reason: 'upstream_error',
      tenant: tenantHost,
      path,
      method,
    });

    // Handle specific error cases
    if ((error as { message?: string }).message?.includes('not authorized')) {
      res.status(401).json({
        error: 'Tenant not authorized. Please complete OAuth flow first.',
        hint: `Visit /auth/start?tenantHost=${tenantHost}`,
      });
      return;
    }

    res.status(502).json({
      error: 'Failed to proxy request to Vincere',
      details: (error as Error).message,
    });
  }
});

