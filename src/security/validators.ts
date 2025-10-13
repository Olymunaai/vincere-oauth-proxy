import { logger } from '../infra/logger.js';

const VINCERE_HOST_PATTERN = /^[a-z0-9-]+\.vincere\.io$/i;

// SSRF protection: blocklist of internal/private IP ranges and hostnames
const SSRF_BLOCKLIST = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS/Azure metadata endpoint
  'metadata.google.internal', // GCP metadata
];

// Private IP ranges (CIDR notation)
const PRIVATE_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^169\.254\./,              // 169.254.0.0/16 (link-local)
  /^fc00:/i,                  // fc00::/7 (IPv6 unique local)
  /^fe80:/i,                  // fe80::/10 (IPv6 link-local)
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a tenant host matches the expected Vincere pattern
 * and is not attempting SSRF attacks
 */
export function validateTenantHost(tenantHost: string): ValidationResult {
  if (!tenantHost || typeof tenantHost !== 'string') {
    return { valid: false, error: 'Tenant host is required' };
  }

  // Trim and lowercase
  const normalized = tenantHost.trim().toLowerCase();

  if (normalized.length === 0 || normalized.length > 253) {
    return { valid: false, error: 'Invalid tenant host length' };
  }

  // Check against Vincere pattern
  if (!VINCERE_HOST_PATTERN.test(normalized)) {
    logger.warn({ tenantHost: normalized }, 'Invalid tenant host pattern');
    return { valid: false, error: 'Invalid tenant host format' };
  }

  // SSRF protection: check blocklist
  if (SSRF_BLOCKLIST.includes(normalized)) {
    logger.warn({ tenantHost: normalized }, 'SSRF attempt detected: blocklisted host');
    return { valid: false, error: 'Invalid tenant host' };
  }

  // SSRF protection: check private IP ranges
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(normalized)) {
      logger.warn({ tenantHost: normalized }, 'SSRF attempt detected: private IP range');
      return { valid: false, error: 'Invalid tenant host' };
    }
  }

  return { valid: true };
}

/**
 * Validates and sanitizes a path to prevent path traversal attacks
 */
export function validatePath(path: string): ValidationResult {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path is required' };
  }

  // Remove leading/trailing whitespace
  const trimmed = path.trim();

  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.includes('//')) {
    logger.warn({ path: trimmed }, 'Path traversal attempt detected');
    return { valid: false, error: 'Invalid path' };
  }

  // Check for null bytes
  if (trimmed.includes('\0')) {
    logger.warn({ path: trimmed }, 'Null byte in path detected');
    return { valid: false, error: 'Invalid path' };
  }

  // Ensure path doesn't try to escape API context
  if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    logger.warn({ path: trimmed }, 'Absolute path/URL attempt detected');
    return { valid: false, error: 'Invalid path format' };
  }

  return { valid: true };
}

/**
 * Validates HTTP method is allowed
 */
export function validateMethod(method: string): ValidationResult {
  const allowedMethods = ['GET', 'POST'];
  const upperMethod = method.toUpperCase();

  if (!allowedMethods.includes(upperMethod)) {
    return { valid: false, error: `Method ${method} not allowed` };
  }

  return { valid: true };
}

/**
 * Validates query string parameters to prevent injection attacks
 */
export function sanitizeQueryParams(params: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    // Only allow string values
    if (typeof value === 'string') {
      // Remove null bytes and control characters
      const cleaned = value.replace(/[\0-\x1F\x7F]/g, '');
      sanitized[key] = cleaned;
    }
  }

  return sanitized;
}

/**
 * Validates OAuth state parameter
 */
export function validateOAuthState(state: string): ValidationResult {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'State parameter is required' };
  }

  // State should be in format: nonce:tenantHost
  const parts = state.split(':');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid state format' };
  }

  const [nonce, tenantHost] = parts;

  // Validate nonce (should be alphanumeric, reasonable length)
  if (!nonce || nonce.length < 16 || nonce.length > 128 || !/^[a-zA-Z0-9-_]+$/.test(nonce)) {
    logger.warn({ state }, 'Invalid OAuth state nonce');
    return { valid: false, error: 'Invalid state' };
  }

  // Validate tenant host
  const hostValidation = validateTenantHost(tenantHost);
  if (!hostValidation.valid) {
    return hostValidation;
  }

  return { valid: true };
}

/**
 * Validates OAuth authorization code
 */
export function validateAuthCode(code: string): ValidationResult {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Authorization code is required' };
  }

  // Code should be alphanumeric/base64-like, reasonable length
  if (code.length < 10 || code.length > 1024) {
    return { valid: false, error: 'Invalid code length' };
  }

  // Allow alphanumeric, hyphens, underscores, and common base64 characters
  if (!/^[a-zA-Z0-9-_=+/]+$/.test(code)) {
    logger.warn('Invalid authorization code format');
    return { valid: false, error: 'Invalid code format' };
  }

  return { valid: true };
}

