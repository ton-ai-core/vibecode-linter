// CHANGE: Use shared makeResolvePackageManagerParams + cache process.cwd()
// WHY: Eliminate duplication; process.cwd() is a syscall, cache it
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: Architecture plan - shared helpers in core
// PURITY: APP (no process.exit here; minimal console usage will be moved to ConsoleService in Iteration 2)
// EFFECT: Effect<ExitCode, AppError>
// INVARIANT: Returns ExitCode as value; no termination side effects
// COMPLEXITY: O(n + m) where n = files inspected, m = diagnostics processed

import { Effect } from "effect";

import { computeExitCode } from "../core/decision.js";
import type { ExitCode } from "../core/models.js";
import type { CLIOptions } from "../core/types/index.js";
import { makeResolvePackageManagerParams } from "../core/utils/package-manager-params.js";
import { parseCLIArgs } from "../shell/config/cli.js";
import { loadLinterConfig } from "../shell/config/index.js";
import { generateSarifReport, processResults } from "../shell/output/index.js";
import { reportProjectInsightsEffect } from "../shell/project-info/index.js";
import { resolvePackageManager } from "../shell/utils/package-manager.js";

import { maybeRunAutoFixEffect } from "./auto-fix.js";
import { collectLintMessagesEffect } from "./collect-lint-messages.js";
import { handleDuplicates } from "./duplicates.js";
import { haveCliDependencies, preflightOk } from "./preflight.js";

/**
 * Orchestrates the linter run and returns ExitCode as value (no process.exit).
 *
 * CHANGE: Use Effect.gen for main orchestration with typed error handling
 * WHY: Compose Effect-based linters with Effect for provable error handling
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based APP composition
 *
 * @param cliOptions - Parsed CLI options
 * @returns Effect<ExitCode, never>
 *
 * @pure false (coordinates effects), but does not terminate the process
 * @effect Effect<ExitCode, never, never> - errors are handled internally
 * @invariant ExitCode ∈ {0,1}
 * @postcondition (hasLintErrors ∨ hasDuplicates) → 1 else 0
 * @complexity O(n + m) where n=files, m=diagnostics
 */
export function runLinter(cliOptions: CLIOptions): Effect.Effect<ExitCode, never, never> {
	return Effect.gen(function* (_) {
		// CHANGE: Cache process.cwd() once
		// WHY: process.cwd() is a syscall; avoid calling 4 times in this function
		const cwd = process.cwd();

		const { packageManager } = resolvePackageManager(
			makeResolvePackageManagerParams(cwd, cliOptions.packageManager),
		);

		if (!preflightOk(cliOptions)) return 1;

		const depsOk = yield* _(
			haveCliDependencies({ cwd, packageManager }),
		);
		if (!depsOk) return 1;

		console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

		yield* _(
			maybeRunAutoFixEffect(
				cliOptions.targetPath,
				cliOptions.noFix,
				packageManager,
			),
		);

		const allMessages = yield* _(
			collectLintMessagesEffect(cliOptions.targetPath, packageManager),
		);

		const sarifPath = yield* _(
			generateSarifReport(cliOptions.targetPath).pipe(
				Effect.catchAll(() => Effect.succeed("")),
			),
		);

		const config = loadLinterConfig();
		const hasLintErrors = yield* _(
			processResults(allMessages, config, cliOptions),
		);

		const hasDuplicates = handleDuplicates(
			hasLintErrors,
			sarifPath,
			cliOptions,
		);

		const shouldReportInsights = !hasLintErrors && !hasDuplicates;
		if (shouldReportInsights) {
			yield* _(reportProjectInsightsEffect(cliOptions.targetPath));
		}

		return computeExitCode({ hasLintErrors, hasDuplicates });
	}) as unknown as Effect.Effect<ExitCode, never, never>;
}

/**
 * Main entry point for the application.
 *
 * @returns Effect<ExitCode, never>
 * @pure false (coordinates effects)
 * @complexity O(1) - orchestration only
 */
export function main(): Effect.Effect<ExitCode, never, never> {
	const cliOptions = parseCLIArgs();
	return runLinter(cliOptions);
}
