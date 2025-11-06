// CHANGE: Extract common execAsync + Effect pattern to eliminate code duplication
// WHY: DRY principle - identical pattern used in git/utils.ts, linters/biome.ts, linters/eslint.ts
// QUOTE(ТЗ): "Любое решение строится на математических инвариантах"
// REF: Duplicate elimination - DUPLICATE #3, #4, #5
// PURITY: SHELL (executes external commands)
// EFFECT: Effect<string, Error, never>
// INVARIANT: ∀ command: execCommand(command) → stdout ∨ Error
// COMPLEXITY: O(1) time, O(n) space where n = stdout length

import { Effect } from "effect";

import { exec, promisify } from "./node-mods.js";

const execAsync = promisify(exec);

/**
 * Extract stdout from error object if available.
 *
 * CHANGE: Centralize stdout extraction logic with proper typing
 * WHY: Identical pattern across multiple files
 * QUOTE(ТЗ): "Математически доказуемые решения"
 * REF: Common error handling pattern
 *
 * @param error - Error object that might contain stdout
 * @returns Extracted stdout or empty string
 * @pure true
 * @complexity O(1)
 */
function extractStdoutFromError(error: Error): string {
	if (
		"stdout" in error &&
		typeof (error as { stdout?: string }).stdout === "string"
	) {
		return (error as { stdout: string }).stdout;
	}
	return "";
}

/**
 * Execute command with Effect pattern and stdout extraction.
 *
 * CHANGE: Common execAsync + Effect.tryPromise + stdout extraction pattern
 * WHY: Eliminate code duplication across git, biome, eslint modules
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: DUPLICATE #3, #4, #5 elimination
 *
 * @param command - Shell command to execute
 * @param options - Optional execution options
 * @returns Effect with stdout or Error
 *
 * @pure false (executes external command)
 * @effect Effect<string, Error, never>
 * @invariant command.length > 0 → (stdout ∨ Error)
 * @complexity O(n) where n = command execution time
 */
export function execCommand(
	command: string,
	options?: { maxBuffer?: number },
): Effect.Effect<string, Error> {
	return Effect.tryPromise({
		try: () => execAsync(command, options),
		catch: (error) => error as Error,
	}).pipe(
		Effect.map(({ stdout }) => String(stdout)),
		Effect.catchAll((error) => {
			const out = extractStdoutFromError(error);
			if (out) {
				return Effect.succeed(out);
			}
			return Effect.fail(error);
		}),
	);
}
