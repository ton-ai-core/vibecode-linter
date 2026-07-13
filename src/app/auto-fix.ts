// CHANGE: Extract auto-fix orchestration into dedicated module
// WHY: runLinter.ts exceeded 300 lines; auto-fix is a distinct concern
// QUOTE(ТЗ): "300 lines max per file"
// REF: Architecture plan - FCIS, single-responsibility modules
// PURITY: APP (runs SHELL auto-fixers; no CORE mutation)
// EFFECT: Effect<void, never>
// INVARIANT: Auto-fix errors are swallowed; pipeline must continue regardless
// COMPLEXITY: O(n) where n = files fixed

import { Effect } from "effect";

import type { PackageManager } from "../core/types/index.js";
import { runBiomeFix, runESLintFix } from "../shell/linters/index.js";

/**
 * Optionally run auto-fixes.
 *
 * CHANGE: Use Effect.all for parallel auto-fix execution
 * WHY: Replace Promise.all with Effect.all for typed error handling
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based APP composition
 *
 * @pure false (runs external tools)
 * @effect Effect<void, ExternalToolError>
 */
export function maybeRunAutoFixEffect(
	targetPath: string,
	noFix: boolean,
	packageManager: PackageManager,
): Effect.Effect<void> {
	if (noFix) return Effect.succeed(undefined);

	// CHANGE: Use Effect.all with concurrent execution and error recovery
	// WHY: Runs both auto-fixers in parallel, continues on individual failures
	return Effect.all(
		[
			runESLintFix(targetPath, packageManager).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
			runBiomeFix(targetPath, packageManager).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
		],
		{ concurrency: "unbounded" },
	).pipe(Effect.map(() => undefined));
}
