import { AxiosResponse } from 'axios';
import { axiosClient } from '../infra/axiosClient.js';
import { logger } from '../infra/logger.js';
import { getSecretOrNull, buildSecretName } from '../infra/keyvault.js';
import { getIdTokenForTenant } from '../oauth/service.js';

export interface VincereRequestOptions {
  tenantHost: string;
  path: string;
  method: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: unknown;
}

export interface VincereResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  durationMs: number;
}

/**
 * Make a request to Vincere API with proper authentication
 */
export async function callVincereApi(
  options: VincereRequestOptions
): Promise<VincereResponse> {
  const startTime = Date.now();
  const { tenantHost, path, method, query, body } = options;

  logger.info({ tenantHost, path, method }, 'Calling Vincere API');

  try {
    // Get id_token for this tenant (cached or refreshed)
    const idToken = await getIdTokenForTenant(tenantHost);

    // Get optional API key from Key Vault
    const apiKeySecretName = buildSecretName(tenantHost, 'api_key');
    const apiKey = await getSecretOrNull(apiKeySecretName);

    // Build full URL
    const url = buildVincereUrl(tenantHost, path, query);

    // Build headers
    const headers: Record<string, string> = {
      'id-token': idToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
      logger.debug({ tenantHost }, 'Including x-api-key header');
    }

    // Make request
    logger.debug({ url, method, headers: redactHeaders(headers) }, 'Sending request to Vincere');

    const response: AxiosResponse = await axiosClient.request({
      url,
      method,
      headers,
      data: method === 'POST' ? body : undefined,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        tenantHost,
        path,
        method,
        status: response.status,
        durationMs,
      },
      'Vincere API response received'
    );

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, string>,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({ error, tenantHost, path, method, durationMs }, 'Vincere API call failed');
    throw error;
  }
}

/**
 * Build Vincere API URL
 */
function buildVincereUrl(
  tenantHost: string,
  path: string,
  query?: Record<string, string>
): string {
  // Always use HTTPS and construct URL from parts
  // Never allow client to pass absolute URLs
  let cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // Ensure path starts with api/v2/
  if (!cleanPath.startsWith('api/v2/')) {
    cleanPath = `api/v2/${cleanPath}`;
  }

  const url = new URL(`https://${tenantHost}/${cleanPath}`);

  // Add query parameters
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Redact sensitive headers for logging
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted = { ...headers };
  const sensitiveKeys = ['id-token', 'x-api-key', 'authorization'];

  for (const key of sensitiveKeys) {
    if (redacted[key]) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Extract row count from Vincere response (if available)
 */
export function extractRowCount(data: unknown): number | undefined {
  if (typeof data === 'object' && data !== null) {
    // Vincere search responses often have structure: { results: [...], total: N }
    if ('results' in data && Array.isArray(data.results)) {
      return data.results.length;
    }
    // Or just an array
    if (Array.isArray(data)) {
      return data.length;
    }
  }
  return undefined;
}

