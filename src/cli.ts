#!/usr/bin/env node
// CHANGE: CLI entry point in IO monad style
// WHY: Eliminate all side effects from pure code, isolate IO
// QUOTE(TЗ): "функциональная парадигма"
// REF: REQ-CLI-001
// SOURCE: IO monad pattern for side effects

import { sum } from './index.js';

/**
 * Pure computation.
 */
const compute = (numbers: readonly number[]): { readonly numbers: readonly number[]; readonly result: number } => ({
  numbers,
  result: sum(numbers)
});

type DeepReadonlyData = {
  readonly numbers: ReadonlyArray<number>;
  readonly result: number;
};

/**
 * Pure output builder.
 */
const buildOutput = (data: DeepReadonlyData): ReadonlyArray<string> => [
  'TypeScript Console Project',
  `Numbers: ${JSON.stringify(data.numbers)}`,
  `Sum: ${data.result}`,
];

/**
 * IO action that returns exit code.
 */
const runIO = (output: readonly string[]): number =>
  output.reduce<number>((code, line) => (console.info(line), code), 0);


/**
 * Main entry point combining pure and IO.
 */
const main = (args: readonly number[]): number => {
  const data = compute(args);
  const output = buildOutput(data);
  return runIO(output);
};

// Execute with default data
const exitCode: number = ((): number => {
  const numbers: readonly number[] = [1, 2, 3, 4, 5];
  return main(numbers);
})();

const runExit = (code: number): void => process.exit(code);
runExit(exitCode);
