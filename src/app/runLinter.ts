// CHANGE: Introduce Application layer orchestration (APP) separated from SHELL and CORE
// WHY: Enforce FCIS — APP composes pure CORE logic with SHELL integrations (to be abstracted as services later)
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"; "CORE никогда не вызывает SHELL"; "Зависимости: SHELL → CORE"
// REF: Architecture plan (Iteration 1)
// PURITY: APP (no process.exit here; minimal console usage will be moved to ConsoleService in Iteration 2)
// EFFECT: Effect<ExitCode, AppError>
// INVARIANT: Returns ExitCode as value; no termination side effects
// COMPLEXITY: O(n + m) where n = files inspected, m = diagnostics processed

import { Effect } from "effect";

import { computeExitCode } from "../core/decision.js";
import type { ExitCode } from "../core/models.js";
import type { CLIOptions } from "../core/types/index.js";
import { parseCLIArgs } from "../shell/config/cli.js";
import { loadLinterConfig } from "../shell/config/index.js";
import { generateSarifReport, processResults } from "../shell/output/index.js";
import { reportProjectInsightsEffect } from "../shell/project-info/index.js";
import { resolvePackageManager } from "../shell/utils/package-manager.js";

import { maybeRunAutoFixEffect } from "./auto-fix.js";
import { collectLintMessagesEffect } from "./collect-lint-messages.js";
import { handleDuplicates } from "./duplicates.js";
import { haveCliDependencies, preflightOk } from "./preflight.js";

function makeResolvePackageManagerParams(
	cwd: string,
	selection: CLIOptions["packageManager"],
): { readonly cwd: string; readonly selection?: typeof selection } {
	return selection === undefined ? { cwd } : { cwd, selection };
}

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
 * @effect Effect<ExitCode, never> - errors are handled internally
 * @invariant ExitCode ∈ {0,1}
 * @postcondition (hasLintErrors ∨ hasDuplicates) → 1 else 0
 * @complexity O(n + m) where n=files, m=diagnostics
 */
export function runLinter(cliOptions: CLIOptions): Effect.Effect<ExitCode> {
	return Effect.gen(function* (_) {
		const { packageManager } = resolvePackageManager(
			makeResolvePackageManagerParams(process.cwd(), cliOptions.packageManager),
		);

		if (!preflightOk(cliOptions)) return 1;

		const depsOk = yield* _(
			haveCliDependencies({ cwd: process.cwd(), packageManager }),
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
	});
}

/**
 * Main entry point for the application.
 *
 * @returns Effect<ExitCode, never>
 * @pure false (coordinates effects)
 * @complexity O(1) - orchestration only
 */
export function main(): Effect.Effect<ExitCode> {
	const cliOptions = parseCLIArgs();
	return runLinter(cliOptions);
}
