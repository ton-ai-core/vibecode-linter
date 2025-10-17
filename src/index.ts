// CHANGE: Main entry point for console application
// WHY: Create executable TypeScript console project
// QUOTE(TЗ): "Создай консольный проект для TypeScript"
// REF: REQ-003
// SOURCE: Functional programming patterns with strict typing

/**
 * Calculates the sum of an array of numbers.
 * 
 * @param numbers - Array of numbers to sum
 * @returns The sum of all numbers
 * 
 * @invariant Result equals the mathematical sum of all input elements
 * @complexity O(n) time, O(1) space where n is the length of the array
 * 
 * @example
 * ```typescript
 * sum([1, 2, 3]); // returns 6
 * sum([]); // returns 0
 * ```
 */
export function sum(numbers: readonly number[]): number {
  // CHANGE: Use reduce for functional approach
  // WHY: Immutable operation aligns with functional paradigm
  // REF: REQ-003
  return numbers.reduce((acc, num) => acc + num, 0);
}
