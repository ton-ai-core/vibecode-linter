// CHANGE: Unit tests for index.ts
// WHY: Verify correctness per .clinerules requirement
// QUOTE(TЗ): "На каждый REQ-ID — тест(ы) и ссылка из RTM"
// REF: REQ-003
// SOURCE: Jest testing patterns for TypeScript

import { sum } from './index';

describe('sum', () => {
  // Test: Empty array
  it('should return 0 for empty array', () => {
    // CHANGE: Test boundary condition
    // WHY: Verify invariant holds for empty input
    // REF: REQ-003
    const result: number = sum([]);
    expect(result).toBe(0);
  });

  // Test: Single element
  it('should return the element for single-element array', () => {
    // CHANGE: Test base case
    // WHY: Verify correctness for minimal input
    // REF: REQ-003
    const result: number = sum([42]);
    expect(result).toBe(42);
  });

  // Test: Multiple positive numbers
  it('should sum multiple positive numbers correctly', () => {
    // CHANGE: Test normal case
    // WHY: Verify arithmetic correctness
    // REF: REQ-003
    const result: number = sum([1, 2, 3, 4, 5]);
    expect(result).toBe(15);
  });

  // Test: Negative numbers
  it('should handle negative numbers correctly', () => {
    // CHANGE: Test with negative values
    // WHY: Verify correctness across full domain
    // REF: REQ-003
    const result: number = sum([-1, -2, -3]);
    expect(result).toBe(-6);
  });

  // Test: Mixed positive and negative
  it('should handle mixed positive and negative numbers', () => {
    // CHANGE: Test mixed signs
    // WHY: Verify algebraic properties
    // REF: REQ-003
    const result: number = sum([10, -5, 3, -2]);
    expect(result).toBe(6);
  });

  // Test: Floating point numbers
  it('should handle floating point numbers', () => {
    // CHANGE: Test decimal values
    // WHY: Verify precision handling
    // REF: REQ-003
    const result: number = sum([0.1, 0.2, 0.3]);
    expect(result).toBeCloseTo(0.6, 10);
  });

  // Test: Large numbers
  it('should handle large numbers', () => {
    // CHANGE: Test edge case with large values
    // WHY: Verify no overflow in standard cases
    // REF: REQ-003
    const result: number = sum([1e10, 2e10, 3e10]);
    expect(result).toBe(6e10);
  });

  // Test: Immutability
  it('should not modify the input array', () => {
    // CHANGE: Test immutability invariant
    // WHY: Ensure functional paradigm compliance
    // REF: REQ-003
    const input: readonly number[] = [1, 2, 3];
    const inputCopy: number[] = [...input];
    sum(input);
    expect([...input]).toEqual(inputCopy);
  });
});
