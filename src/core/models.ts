// CHANGE: Introduce Functional Core domain models (pure, immutable)
// WHY: Establish FCIS separation — CORE contains only pure types/functions and invariants
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: Architecture plan (Iteration 1 scaffolding)
// PURITY: CORE
// INVARIANT: CORE defines no effects; data is immutable
// COMPLEXITY: O(1)

/**
 * Exit code for the linter process.
 *
 * @remarks
 * - @pure true
 * - @invariant exitCode ∈ {0, 1}
 */
export type ExitCode = 0 | 1;

/**
 * Minimal decision state for producing exit code from diagnostics.
 *
 * @remarks
 * - @pure true
 * - @precondition flags are computed from diagnostics deterministically
 * - @invariant state is immutable
 * - @complexity O(1)
 */
export interface DecisionState {
	readonly hasLintErrors: boolean;
	readonly hasDuplicates: boolean;
}
