#!/usr/bin/env node
// CHANGE: CLI entry point with side effects
// WHY: Separate imperative CLI code from pure functional core
// QUOTE(TЗ): "функциональная парадигма"
// REF: REQ-CLI-001
// SOURCE: Separation of concerns pattern

import { sum } from './index.js';

/**
 * CLI entry point with side effects.
 * Calls pure functions and performs I/O.
 */
function cli(): void {
  const numbers: readonly number[] = [1, 2, 3, 4, 5];
  const result: number = sum(numbers);
  
  console.info('TypeScript Console Project');
  console.info('Numbers:', numbers);
  console.info('Sum:', result);
}

// Execute CLI
try {
  cli();
} catch (error) {
  console.error('Error:', (error as Error).message);
  process.exit(1);
}
