// CHANGE: Extract common linter error handling patterns
// WHY: Remove code duplication between biome.ts and eslint.ts (jscpd violation)
// QUOTE(ТЗ): "В коде не должно быть дублей"
// REF: REQ-LINT-FIX, jscpd duplicate detection
// PURITY: SHELL (handles external tool errors)

import { extractStdoutFromError } from "../../core/types/index.js";

/**
 * Tries to extract stdout from external tool error.
 * If stdout exists, returns it. Otherwise, re-throws the error.
 *
 * CHANGE: Extracted common pattern from biome.ts and eslint.ts
 * WHY: Both linters use identical error recovery logic (8 line duplicate)
 * QUOTE(JSCPD): "DUPLICATE #1: src/shell/linters/biome.ts:109-116 ↔ eslint.ts:117-125"
 * REF: jscpd duplicate detection
 *
 * @param error Error from external tool execution (unknown from catch blocks)
 * @returns stdout string if available
 * @throws Error if stdout is not available
 *
 * @pure false - throws errors
 * @invariant (∃ stdout ∈ error) → returns string, otherwise throws Error
 * @complexity O(1)
 */
export function extractStdoutOrThrow(error: Error): string {
	// CHANGE: Extract stdout from Error object
	// WHY: External tools may return errors with stdout in them
	// REF: extractStdoutFromError, REQ-LINT-FIX
	const stdout = extractStdoutFromError(error);
	if (typeof stdout === "string" && stdout.length > 0) {
		return stdout;
	}
	// CHANGE: Throw Error explicitly to satisfy @typescript-eslint/only-throw-error
	// WHY: ESLint rule requires throwing Error objects, not unknown values
	// REF: @typescript-eslint/only-throw-error
	throw error;
}
