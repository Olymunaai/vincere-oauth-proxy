import {
  validateTenantHost,
  validatePath,
  validateMethod,
  validateOAuthState,
  validateAuthCode,
  sanitizeQueryParams,
} from '../src/security/validators';

describe('Security Validators', () => {
  describe('validateTenantHost', () => {
    it('should accept valid Vincere hosts', () => {
      expect(validateTenantHost('ecigroup.vincere.io').valid).toBe(true);
      expect(validateTenantHost('test-tenant.vincere.io').valid).toBe(true);
      expect(validateTenantHost('abc123.vincere.io').valid).toBe(true);
    });

    it('should reject invalid patterns', () => {
      expect(validateTenantHost('example.com').valid).toBe(false);
      expect(validateTenantHost('vincere.io').valid).toBe(false);
      expect(validateTenantHost('test.vincere.com').valid).toBe(false);
    });

    it('should reject SSRF attempts - localhost', () => {
      expect(validateTenantHost('localhost').valid).toBe(false);
      expect(validateTenantHost('127.0.0.1').valid).toBe(false);
      expect(validateTenantHost('::1').valid).toBe(false);
    });

    it('should reject empty or invalid input', () => {
      expect(validateTenantHost('').valid).toBe(false);
      expect(validateTenantHost('   ').valid).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should accept valid API paths', () => {
      expect(validatePath('candidate/search').valid).toBe(true);
      expect(validatePath('api/v2/candidate/123').valid).toBe(true);
      expect(validatePath('company').valid).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(validatePath('../etc/passwd').valid).toBe(false);
      expect(validatePath('api/../secret').valid).toBe(false);
      expect(validatePath('test//path').valid).toBe(false);
    });

    it('should reject absolute URLs', () => {
      expect(validatePath('http://evil.com').valid).toBe(false);
      expect(validatePath('https://evil.com').valid).toBe(false);
      expect(validatePath('/etc/passwd').valid).toBe(false);
    });

    it('should reject null bytes', () => {
      expect(validatePath('test\0path').valid).toBe(false);
    });
  });

  describe('validateMethod', () => {
    it('should accept GET and POST', () => {
      expect(validateMethod('GET').valid).toBe(true);
      expect(validateMethod('POST').valid).toBe(true);
      expect(validateMethod('get').valid).toBe(true);
      expect(validateMethod('post').valid).toBe(true);
    });

    it('should reject other methods', () => {
      expect(validateMethod('DELETE').valid).toBe(false);
      expect(validateMethod('PUT').valid).toBe(false);
      expect(validateMethod('PATCH').valid).toBe(false);
      expect(validateMethod('OPTIONS').valid).toBe(false);
    });
  });

  describe('validateOAuthState', () => {
    it('should accept valid state format', () => {
      const state = 'abcdef123456789012345678:ecigroup.vincere.io';
      expect(validateOAuthState(state).valid).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(validateOAuthState('invalid').valid).toBe(false);
      expect(validateOAuthState('nonce-only').valid).toBe(false);
      expect(validateOAuthState('short:ecigroup.vincere.io').valid).toBe(false);
    });

    it('should reject invalid tenant in state', () => {
      const state = 'abcdef123456789012345678:evil.com';
      expect(validateOAuthState(state).valid).toBe(false);
    });
  });

  describe('validateAuthCode', () => {
    it('should accept valid auth codes', () => {
      expect(validateAuthCode('abcdef123456').valid).toBe(true);
      expect(validateAuthCode('ABC-123_456+789/xyz=').valid).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(validateAuthCode('').valid).toBe(false);
      expect(validateAuthCode('short').valid).toBe(false);
      expect(validateAuthCode('invalid<>code').valid).toBe(false);
    });
  });

  describe('sanitizeQueryParams', () => {
    it('should sanitize valid params', () => {
      const input = { foo: 'bar', baz: 'qux' };
      const output = sanitizeQueryParams(input);
      expect(output).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should remove null bytes and control chars', () => {
      const input = { test: 'hello\0world\x01test' };
      const output = sanitizeQueryParams(input);
      expect(output.test).toBe('helloworldtest');
    });

    it('should filter out non-string values', () => {
      const input = { str: 'valid', num: 123, obj: { nested: 'val' }, arr: ['a'] };
      const output = sanitizeQueryParams(input);
      expect(output).toEqual({ str: 'valid' });
    });
  });
});

