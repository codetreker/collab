import { describe, it, expect } from 'vitest';
import {
  generateRankBetween,
  generateInitialRank,
  rebalance,
  compareLexorank,
  midpoint,
} from '../lexorank.js';

describe('lexorank', () => {
  describe('generateRankBetween', () => {
    it('returns an initial rank when both args are null', () => {
      const rank = generateRankBetween(null, null);
      expect(rank).toMatch(/^0\|/);
      expect(rank.length).toBeGreaterThan(2);
    });

    it('returns a rank greater than `before` when after is null', () => {
      const before = '0|hzzzzz';
      const rank = generateRankBetween(before, null);
      expect(rank > before).toBe(true);
    });

    it('returns a rank less than `after` when before is null', () => {
      const after = '0|hzzzzz';
      const rank = generateRankBetween(null, after);
      expect(rank < after).toBe(true);
    });

    it('returns a rank between before and after', () => {
      const before = '0|baaaaa';
      const after = '0|zzzzzz';
      const rank = generateRankBetween(before, after);
      expect(rank > before).toBe(true);
      expect(rank < after).toBe(true);
    });

    it('maintains correct order after 20 sequential inserts at end', () => {
      const ranks: string[] = [];
      let prev: string | null = null;
      for (let i = 0; i < 20; i++) {
        const rank = generateRankBetween(prev, null);
        ranks.push(rank);
        prev = rank;
      }
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i] > ranks[i - 1]).toBe(true);
      }
    });

    it('expands precision when inserting between adjacent ranks', () => {
      // Two very close ranks
      const a = '0|ma';
      const b = '0|mb';
      const between = generateRankBetween(a, b);
      expect(between > a).toBe(true);
      expect(between < b).toBe(true);
      // The result should be longer (more chars) to fit between
      const rankPart = between.split('|')[1];
      expect(rankPart.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generateInitialRank', () => {
    it('returns a well-formed rank string', () => {
      const rank = generateInitialRank();
      expect(rank).toBe('0|hzzzzz');
    });
  });

  describe('rebalance', () => {
    it('returns empty array for empty input', () => {
      expect(rebalance([])).toEqual([]);
    });

    it('evenly redistributes ranks and preserves order', () => {
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = rebalance(items);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      // Each position should have bucket prefix
      for (const r of result) {
        expect(r.position).toMatch(/^0\|/);
      }
      // Positions should be in ascending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].position > result[i - 1].position).toBe(true);
      }
    });

    it('produces unique positions for many items', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i}` }));
      const result = rebalance(items);
      const positions = result.map((r) => r.position);
      const unique = new Set(positions);
      expect(unique.size).toBe(50);
    });
  });

  describe('compareLexorank', () => {
    it('returns -1 when a < b', () => {
      expect(compareLexorank('0|aaa', '0|bbb')).toBe(-1);
    });

    it('returns 1 when a > b', () => {
      expect(compareLexorank('0|bbb', '0|aaa')).toBe(1);
    });

    it('returns 0 when a === b', () => {
      expect(compareLexorank('0|mmm', '0|mmm')).toBe(0);
    });

    it('sorts an array correctly', () => {
      const ranks = ['0|zzz', '0|aaa', '0|mmm'];
      ranks.sort(compareLexorank);
      expect(ranks).toEqual(['0|aaa', '0|mmm', '0|zzz']);
    });
  });
});
