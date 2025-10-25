// CHANGE: Add pure decision function to compute exit code from diagnostic state
// WHY: Centralize the theorem of termination into Functional Core (pure, testable)
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// REF: FCIS plan — Iteration 1 (core decision)
// FORMAT THEOREM: ∀s ∈ State: (s.hasLintErrors ∨ s.hasDuplicates) ↔ computeExitCode(s) = 1
// PURITY: CORE
// INVARIANT: No side effects, deterministic mapping State → ExitCode
// COMPLEXITY: O(1) time / O(1) space

import type { DecisionState, ExitCode } from "./models.js";

/**
 * Computes process exit code from diagnostic state.
 *
 * @param state - Immutable flags computed from diagnostics
 * @returns 1 if there are lint errors or duplicates; otherwise 0
 *
 * @pure true
 * @invariant exitCode ∈ {0,1}
 * @precondition state is derived deterministically from analysis
 * @postcondition (state.hasLintErrors ∨ state.hasDuplicates) → result = 1
 * @complexity O(1)
 */
export const computeExitCode = (state: DecisionState): ExitCode =>
	(state.hasLintErrors || state.hasDuplicates ? 1 : 0) as ExitCode;
