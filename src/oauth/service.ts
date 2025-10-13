import { AxiosResponse } from 'axios';
import { config } from '../config/index.js';
import { axiosClient } from '../infra/axiosClient.js';
import { logger } from '../infra/logger.js';
import { buildSecretName, getSecretOrNull, setSecret } from '../infra/keyvault.js';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedIdToken {
  token: string;
  expiresAt: number;
}

// In-memory cache for id_tokens per tenant
const idTokenCache = new Map<string, CachedIdToken>();

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  tenantHost: string
): Promise<{ refreshToken: string; idToken: string }> {
  const tokenUrl = `${config.vincere.idBase}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.vincere.clientId,
    redirect_uri: config.vincere.redirectUri,
  });

  logger.info({ tenantHost, tokenUrl }, 'Exchanging authorization code for tokens');

  try {
    const response: AxiosResponse<TokenResponse> = await axiosClient.post(
      tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (response.status !== 200) {
      logger.error(
        { status: response.status, data: response.data },
        'Token exchange failed'
      );
      throw new Error(`Token exchange failed with status ${response.status}`);
    }

    const data = response.data;

    if (!data.refresh_token || !data.id_token) {
      logger.error({ data }, 'Missing tokens in response');
      throw new Error('Invalid token response');
    }

    logger.info({ tenantHost }, 'Successfully exchanged code for tokens');

    return {
      refreshToken: data.refresh_token,
      idToken: data.id_token,
    };
  } catch (error) {
    logger.error({ error, tenantHost }, 'Error exchanging authorization code');
    throw error;
  }
}

/**
 * Refresh tokens using refresh_token
 */
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const tokenUrl = `${config.vincere.idBase}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.vincere.clientId,
  });

  logger.debug('Refreshing tokens');

  try {
    const response: AxiosResponse<TokenResponse> = await axiosClient.post(
      tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (response.status !== 200) {
      logger.error(
        { status: response.status, data: response.data },
        'Token refresh failed'
      );
      throw new Error(`Token refresh failed with status ${response.status}`);
    }

    const data = response.data;

    if (!data.id_token) {
      logger.error({ data }, 'Missing id_token in refresh response');
      throw new Error('Invalid token refresh response');
    }

    logger.debug('Successfully refreshed tokens');

    return data;
  } catch (error) {
    logger.error({ error }, 'Error refreshing tokens');
    throw error;
  }
}

/**
 * Get id_token for a tenant (with caching)
 */
export async function getIdTokenForTenant(tenantHost: string): Promise<string> {
  // Check cache first
  const cached = idTokenCache.get(tenantHost);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    logger.debug({ tenantHost }, 'Using cached id_token');
    return cached.token;
  }

  // Cache miss or expired - need to refresh
  logger.debug({ tenantHost }, 'Cache miss, refreshing id_token');

  const refreshTokenSecretName = buildSecretName(tenantHost, 'refresh_token');
  const refreshToken = await getSecretOrNull(refreshTokenSecretName);

  if (!refreshToken) {
    logger.error({ tenantHost }, 'No refresh token found for tenant');
    throw new Error('Tenant not authorized - no refresh token found');
  }

  try {
    const tokens = await refreshTokens(refreshToken);

    // Cache the new id_token
    const cacheSeconds = config.security.idTokenCacheSeconds;
    const expiresAt = now + cacheSeconds * 1000;

    idTokenCache.set(tenantHost, {
      token: tokens.id_token,
      expiresAt,
    });

    logger.info({ tenantHost, cacheSeconds }, 'Cached new id_token');

    // If we got a new refresh token, update Key Vault
    if (tokens.refresh_token) {
      logger.info({ tenantHost }, 'Updating refresh token in Key Vault');
      await setSecret(refreshTokenSecretName, tokens.refresh_token);
    }

    return tokens.id_token;
  } catch (error) {
    logger.error({ error, tenantHost }, 'Failed to get id_token for tenant');
    throw error;
  }
}

/**
 * Store refresh token for a tenant
 */
export async function storeRefreshToken(
  tenantHost: string,
  refreshToken: string
): Promise<void> {
  const secretName = buildSecretName(tenantHost, 'refresh_token');
  await setSecret(secretName, refreshToken);
  logger.info({ tenantHost }, 'Stored refresh token in Key Vault');
}

/**
 * Generate cryptographic state nonce
 */
export function generateStateNonce(tenantHost: string): string {
  // Generate random nonce (base64url)
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = Buffer.from(randomBytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Format: nonce:tenantHost
  return `${nonce}:${tenantHost}`;
}

/**
 * Clear cached id_token for a tenant (useful for testing/debugging)
 */
export function clearIdTokenCache(tenantHost?: string): void {
  if (tenantHost) {
    idTokenCache.delete(tenantHost);
    logger.debug({ tenantHost }, 'Cleared id_token cache for tenant');
  } else {
    idTokenCache.clear();
    logger.debug('Cleared all id_token cache');
  }
}

