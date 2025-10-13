import { generateStateNonce } from '../src/oauth/service';

describe('OAuth Service', () => {
  describe('generateStateNonce', () => {
    it('should generate valid state nonce', () => {
      const tenantHost = 'ecigroup.vincere.io';
      const state = generateStateNonce(tenantHost);

      // Should be in format nonce:tenantHost
      expect(state).toContain(':');
      const parts = state.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[1]).toBe(tenantHost);

      // Nonce should be base64url-like
      const nonce = parts[0];
      expect(nonce.length).toBeGreaterThan(20);
      expect(nonce).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it('should generate unique nonces', () => {
      const tenantHost = 'test.vincere.io';
      const state1 = generateStateNonce(tenantHost);
      const state2 = generateStateNonce(tenantHost);

      expect(state1).not.toBe(state2);
    });
  });
});

