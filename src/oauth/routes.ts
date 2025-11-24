import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { createRequestLogger } from '../infra/logger.js';
import { trackEvent } from '../infra/appInsights.js';
import { validateTenantHost, validateOAuthState, validateAuthCode } from '../security/validators.js';
import {
  exchangeCodeForTokens,
  storeRefreshToken,
  generateStateNonce,
} from './service.js';

export const oauthRouter = Router();

/**
 * Start OAuth flow
 * GET /auth/start?tenantHost=<host>
 */
oauthRouter.get('/start', (req: Request, res: Response) => {
  const reqLogger = createRequestLogger(req.correlationId || 'unknown');
  const tenantHost = req.query.tenantHost as string;

  reqLogger.info({ tenantHost }, 'OAuth start requested');

  // Validate tenant host
  const validation = validateTenantHost(tenantHost);
  if (!validation.valid) {
    reqLogger.warn({ tenantHost, error: validation.error }, 'Invalid tenant host');
    trackEvent('oauth_start_failed', { reason: 'invalid_host' });
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    // Generate state nonce
    const state = generateStateNonce(tenantHost);

    // Build authorization URL
    const authUrl = new URL(`${config.vincere.idBase}/oauth2/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.vincere.clientId);
    authUrl.searchParams.set('redirect_uri', config.vincere.redirectUri);
    authUrl.searchParams.set('state', state);

    reqLogger.info({ tenantHost, authUrl: authUrl.toString() }, 'Redirecting to Vincere authorization');
    trackEvent('oauth_start_success', { tenant: tenantHost });

    res.redirect(authUrl.toString());
  } catch (error) {
    reqLogger.error({ error, tenantHost }, 'Error starting OAuth flow');
    trackEvent('oauth_start_failed', { reason: 'error' });
    res.status(500).json({ error: 'Failed to start authorization' });
  }
});

/**
 * OAuth callback
 * GET /auth/callback?code=...&state=<nonce:tenantHost>
 */
oauthRouter.get('/callback', async (req: Request, res: Response) => {
  const reqLogger = createRequestLogger(req.correlationId || 'unknown');
  const { code, state, error, error_description } = req.query;

  reqLogger.info({ hasCode: !!code, hasState: !!state, error }, 'OAuth callback received');

  // Check for OAuth error
  if (error) {
    reqLogger.error({ error, error_description }, 'OAuth error from Vincere');
    trackEvent('oauth_callback_failed', { reason: 'oauth_error', error: String(error) });
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authorization Failed</title></head>
      <body>
        <h1>Authorization Failed</h1>
        <p>Error: ${error}</p>
        <p>${error_description || ''}</p>
      </body>
      </html>
    `);
    return;
  }

  // Validate code
  const codeValidation = validateAuthCode(code as string);
  if (!codeValidation.valid) {
    reqLogger.warn({ error: codeValidation.error }, 'Invalid authorization code');
    trackEvent('oauth_callback_failed', { reason: 'invalid_code' });
    res.status(400).json({ error: codeValidation.error });
    return;
  }

  // Validate state
  const stateValidation = validateOAuthState(state as string);
  if (!stateValidation.valid) {
    reqLogger.warn({ error: stateValidation.error }, 'Invalid OAuth state');
    trackEvent('oauth_callback_failed', { reason: 'invalid_state' });
    res.status(400).json({ error: stateValidation.error });
    return;
  }

  // Extract tenant from state
  const tenantHost = (state as string).split(':')[1];

  try {
    // Exchange code for tokens
    const { refreshToken } = await exchangeCodeForTokens(code as string, tenantHost);

    // Store refresh token in Key Vault
    await storeRefreshToken(tenantHost, refreshToken);

    reqLogger.info({ tenantHost }, 'Successfully completed OAuth flow');
    trackEvent('oauth_callback_success', { tenant: tenantHost });

    // Serve success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Complete</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          h1 { color: #28a745; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <h1>✓ Authorization Complete</h1>
        <p>Successfully authorized tenant: <strong>${tenantHost}</strong></p>
        <p>You can close this window.</p>
      </body>
      </html>
    `);
  } catch (error) {
    reqLogger.error({ error, tenantHost }, 'Error completing OAuth callback');
    trackEvent('oauth_callback_failed', { reason: 'exchange_error', tenant: tenantHost });
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authorization Failed</title></head>
      <body>
        <h1>Authorization Failed</h1>
        <p>An error occurred while completing authorization.</p>
        <p>Please try again or contact support.</p>
      </body>
      </html>
    `);
  }
});

