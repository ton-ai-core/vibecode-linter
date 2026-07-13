// CHANGE: Extract duplicated makeResolvePackageManagerParams helper to shared core utils
// WHY: DRY — same helper was duplicated in runLinter.ts and preflight.ts; single source of truth
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"; pure CORE helpers belong in core/
// REF: Architecture plan - shared helpers in core
// PURITY: pure (no side effects, no I/O, no exceptions)
// EFFECT: synchronous (pure function)
// INVARIANT: ∄ cwd === undefined; selection may be undefined
// COMPLEXITY: O(1)

import type { CLIOptions, PackageManagerSelection } from "../types/index.js";

/**
 * Build the parameter object for resolvePackageManager.
 *
 * Encapsulates the rule that `selection` is optional and should be omitted
 * entirely when not provided, so downstream `=== undefined` checks work
 * consistently.
 *
 * @pure true
 * @param cwd - working directory (must be defined)
 * @param selection - optional explicit package manager selection
 * @returns readonly param object for resolvePackageManager
 */
export function makeResolvePackageManagerParams(
	cwd: string,
	selection: CLIOptions["packageManager"],
): { readonly cwd: string; readonly selection?: PackageManagerSelection } {
	return selection === undefined ? { cwd } : { cwd, selection };
}
