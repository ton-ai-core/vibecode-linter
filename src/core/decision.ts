// CHANGE: Add pure decision function to compute exit code using Effect
// WHY: Centralize termination logic in Functional Core with Effect composition support
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// REF: FCIS plan — Iteration 1 (core decision), Effect integration
// SOURCE: https://effect.website/docs/introduction
// FORMAT THEOREM: ∀s ∈ State: (s.hasLintErrors ∨ s.hasDuplicates) ↔ computeExitCode(s) = 1
// PURITY: CORE
// INVARIANT: No side effects, deterministic mapping State → ExitCode
// COMPLEXITY: O(1) time / O(1) space

import { Effect, flow, pipe } from "effect";

import type { DecisionState, ExitCode } from "./models.js";

/**
 * Computes process exit code from diagnostic state (pure function).
 *
 * @param state - Immutable flags computed from diagnostics
 * @returns 1 if there are lint errors or duplicates; otherwise 0
 *
 * @pure true
 * @invariant exitCode ∈ {0,1}
 * @precondition state is derived deterministically from analysis
 * @postcondition (state.hasLintErrors ∨ state.hasDuplicates) → result = 1
 * @complexity O(1)
 *
 * @example
 * ```ts
 * // Pure function usage
 * const exitCode = computeExitCode({ hasLintErrors: true, hasDuplicates: false });
 * // exitCode === 1
 *
 * // Pipe composition
 * const result = pipe(
 *   { hasLintErrors: false, hasDuplicates: true },
 *   computeExitCode
 * ); // => 1
 * ```
 */
export const computeExitCode = (state: DecisionState): ExitCode =>
	pipe(
		state,
		// CHANGE: Use pipe for functional composition
		// WHY: Demonstrates pipe usage even for simple logic
		// FORMAT THEOREM: pipe(state, hasErrors, toExitCode) = toExitCode(hasErrors(state))
		// PURITY: CORE
		// INVARIANT: ∀ state: result ∈ {0, 1}
		// COMPLEXITY: O(1)
		(s) => s.hasLintErrors || s.hasDuplicates,
		(hasErrors) => (hasErrors ? 1 : 0) as ExitCode,
	);

/**
 * Curried version using flow for partial application.
 *
 * @pure true
 * @invariant Always returns a function that produces ExitCode ∈ {0,1}
 * @complexity O(1)
 *
 * @example
 * ```ts
 * const checkErrors = flow(
 *   (state: DecisionState) => state.hasLintErrors || state.hasDuplicates,
 *   (hasErrors: boolean) => (hasErrors ? 1 : 0) as ExitCode
 * );
 * ```
 */
export const computeExitCodeFlow = flow(
	(state: DecisionState) => state.hasLintErrors || state.hasDuplicates,
	(hasErrors: boolean) => (hasErrors ? 1 : 0) as ExitCode,
);

/**
 * Computes exit code as an Effect for composition with other Effects.
 *
 * @param state - Immutable flags computed from diagnostics
 * @returns Effect that succeeds with exit code (never fails)
 *
 * @pure false - wraps in Effect for composition
 * @effect Effect<ExitCode, never, never>
 * @invariant Result is Effect.succeed(exitCode) where exitCode ∈ {0,1}
 * @complexity O(1)
 *
 * @example
 * ```ts
 * import { Effect, pipe } from "effect";
 *
 * const program = pipe(
 *   analyzeCode(),
 *   Effect.map(results => ({ hasLintErrors: results.errors > 0, hasDuplicates: false })),
 *   Effect.flatMap(computeExitCodeEffect)
 * );
 * ```
 */
export const computeExitCodeEffect = (
	state: DecisionState,
): Effect.Effect<ExitCode> =>
	pipe(
		state,
		computeExitCode,
		Effect.succeed,
		// CHANGE: Use pipe for Effect composition
		// WHY: Demonstrates Effect pipeline pattern
		// FORMAT THEOREM: pipe(state, pure, Effect.succeed) = Effect.succeed(pure(state))
		// PURITY: Wraps pure computation in Effect
		// EFFECT: Effect<ExitCode, never, never>
		// COMPLEXITY: O(1)
	);
