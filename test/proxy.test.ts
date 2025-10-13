import { extractRowCount } from '../src/proxy/vincereClient';

describe('Vincere Client', () => {
  describe('extractRowCount', () => {
    it('should extract count from results array', () => {
      const data = {
        results: [{ id: 1 }, { id: 2 }, { id: 3 }],
        total: 100,
      };
      expect(extractRowCount(data)).toBe(3);
    });

    it('should extract count from plain array', () => {
      const data = [{ id: 1 }, { id: 2 }];
      expect(extractRowCount(data)).toBe(2);
    });

    it('should return undefined for non-array responses', () => {
      expect(extractRowCount({ id: 1, name: 'test' })).toBeUndefined();
      expect(extractRowCount('string')).toBeUndefined();
      expect(extractRowCount(123)).toBeUndefined();
      expect(extractRowCount(null)).toBeUndefined();
    });

    it('should handle empty arrays', () => {
      expect(extractRowCount([])).toBe(0);
      expect(extractRowCount({ results: [] })).toBe(0);
    });
  });
});

