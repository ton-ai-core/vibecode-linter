// CHANGE: Tests for Either monad
// WHY: Ensure Either monad works correctly
// REF: REQ-LINT-FP-001

import { left, right, eitherMap, eitherFlatMap, eitherGetOrElse } from '../../src/lint/either';

describe('Either monad', () => {
  describe('left', () => {
    it('should create Left value', () => {
      const result = left(new Error('test error'));
      expect(result.tag).toBe('Left');
      expect(result.error.message).toBe('test error');
    });
  });

  describe('right', () => {
    it('should create Right value', () => {
      const result = right(42);
      expect(result.tag).toBe('Right');
      expect(result.value).toBe(42);
    });
  });

  describe('eitherMap', () => {
    it('should map Right value', () => {
      const result = eitherMap((x: number) => x * 2, right(21));
      expect(result.tag).toBe('Right');
      if (result.tag === 'Right') {
        expect(result.value).toBe(42);
      }
    });

    it('should not map Left value', () => {
      const err = new Error('test');
      const result = eitherMap((x: number) => x * 2, left(err));
      expect(result.tag).toBe('Left');
      if (result.tag === 'Left') {
        expect(result.error).toBe(err);
      }
    });
  });

  describe('eitherFlatMap', () => {
    it('should flatMap Right value', () => {
      const result = eitherFlatMap((x: number) => right(x * 2), right(21));
      expect(result.tag).toBe('Right');
      if (result.tag === 'Right') {
        expect(result.value).toBe(42);
      }
    });

    it('should flatMap to Left', () => {
      const err = new Error('test');
      const result = eitherFlatMap((x: number) => left(err), right(21));
      expect(result.tag).toBe('Left');
      if (result.tag === 'Left') {
        expect(result.error).toBe(err);
      }
    });

    it('should not flatMap Left value', () => {
      const err = new Error('test');
      const result = eitherFlatMap((x: number) => right(x * 2), left(err));
      expect(result.tag).toBe('Left');
      if (result.tag === 'Left') {
        expect(result.error).toBe(err);
      }
    });
  });

  describe('eitherGetOrElse', () => {
    it('should get Right value', () => {
      const result = eitherGetOrElse(0, right(42));
      expect(result).toBe(42);
    });

    it('should get default on Left', () => {
      const result = eitherGetOrElse(0, left(new Error('test')));
      expect(result).toBe(0);
    });
  });
});
