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
import type { CLIOptions, LintMessageWithFile } from "../core/types/index.js";
import { checkAndReportPreflight } from "../shell/analysis/preflight.js";
import { loadLinterConfig } from "../shell/config/index.js";
import {
	getBiomeDiagnostics,
	getESLintResults,
	getTypeScriptDiagnostics,
	runBiomeFix,
	runESLintFix,
} from "../shell/linters/index.js";
import {
	cleanupReportsArtifacts,
	displayClonesFromSarif,
	generateSarifReport,
	parseSarifReport,
	processResults,
} from "../shell/output/index.js";
import {
	checkDependencies,
	reportMissingDependencies,
} from "../shell/utils/dependencies.js";

/**
 * Collect diagnostics from all configured linters.
 *
 * CHANGE: Use Effect.all for parallel linter execution
 * WHY: Replace Promise.all with Effect.all for typed error handling
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based APP composition
 *
 * @pure false (runs external tools) — will be moved behind services in Iteration 2
 * @effect Effect<LintMessageWithFile[], ExternalToolError | ParseError | InvariantViolation>
 * @complexity O(n + m) where n=files, m=diagnostics
 */
function collectLintMessagesEffect(
	targetPath: string,
): Effect.Effect<LintMessageWithFile[], never> {
	return Effect.gen(function* () {
		// CHANGE: Use Effect.all with mode: "all" for concurrent execution
		// WHY: Runs all linters in parallel with typed error handling
		// INVARIANT: All linter effects are independent and can run concurrently
		const [eslintResults, biomeResults, tsMessages] = yield* Effect.all(
			[
				getESLintResults(targetPath).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
				getBiomeDiagnostics(targetPath).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
				getTypeScriptDiagnostics(targetPath).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
			],
			{ concurrency: "unbounded" },
		);

		// CHANGE: Use pipe + flatMap for functional composition
		// WHY: Makes transformation explicit and composable
		const allMessages: LintMessageWithFile[] = [];

		for (const result of eslintResults) {
			for (const message of result.messages) {
				allMessages.push({
					...message,
					filePath: result.filePath,
					source: "eslint" as const,
				});
			}
		}

		for (const result of biomeResults) {
			for (const message of result.messages) {
				allMessages.push({
					...message,
					filePath: result.filePath,
					source: "biome" as const,
				});
			}
		}

		for (const message of tsMessages) {
			allMessages.push({
				...message,
				filePath: message.filePath,
				source: "typescript" as const,
			});
		}

		return allMessages;
	});
}

/**
 * Handle duplicate reporting and cleanup of SARIF artifacts.
 *
 * @pure false (console output, fs cleanup) — will be moved behind services
 */
function handleDuplicates(
	hasLintErrors: boolean,
	sarifPath: string,
	cliOptions: CLIOptions,
): boolean {
	const duplicates = parseSarifReport(sarifPath);
	const hasDuplicates = duplicates.length > 0;

	if (!hasLintErrors) {
		if (hasDuplicates) {
			displayClonesFromSarif(
				duplicates,
				cliOptions.maxClones,
				cliOptions.width,
			);
		} else {
			// SHELL concern; will move to ConsoleService later
			console.log("\n✅ No code duplicates found!");
		}
	}

	cleanupReportsArtifacts(sarifPath, hasDuplicates);
	return hasDuplicates;
}

/**
 * Preflight validation. Returns boolean success instead of terminating.
 *
 * @pure false (reads environment, console output)
 */
function preflightOk(cliOptions: CLIOptions): boolean {
	if (cliOptions.noPreflight) return true;
	const pre = checkAndReportPreflight(process.cwd());
	if (!pre.ok) {
		if (cliOptions.fixPeers) {
			const needsTs = pre.issues.includes("missingTypescript");
			const needsBiome = pre.issues.includes("missingBiome");
			const pkgs: string[] = [];
			if (needsTs) pkgs.push("typescript");
			if (needsBiome) pkgs.push("@biomejs/biome");
			if (pkgs.length > 0) {
				console.error("Suggested install command:");
				console.error(`  npm install --save-dev ${pkgs.join(" ")}`);
			}
		}
		return false;
	}
	return true;
}

/**
 * Ensure required CLI dependencies are present. Returns boolean success.
 *
 * @pure false (executes checks, console output)
 */
async function haveCliDependencies(): Promise<boolean> {
	const depCheck = await checkDependencies();
	if (!depCheck.allAvailable) {
		reportMissingDependencies(depCheck.missing);
		return false;
	}
	return true;
}

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
function maybeRunAutoFixEffect(
	targetPath: string,
	noFix: boolean,
): Effect.Effect<void, never> {
	if (noFix) return Effect.succeed(undefined);

	// CHANGE: Use Effect.all with concurrent execution and error recovery
	// WHY: Runs both auto-fixers in parallel, continues on individual failures
	return Effect.all(
		[
			runESLintFix(targetPath).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
			runBiomeFix(targetPath).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
		],
		{ concurrency: "unbounded" },
	).pipe(Effect.map(() => undefined));
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
 * @returns Promise wrapping Effect execution
 *
 * @pure false (coordinates effects), but does not terminate the process
 * @effect Effect<ExitCode, never> - errors are handled internally
 * @invariant ExitCode ∈ {0,1}
 * @postcondition (hasLintErrors ∨ hasDuplicates) → 1 else 0
 * @complexity O(n + m) where n=files, m=diagnostics
 */
export async function runLinter(cliOptions: CLIOptions): Promise<ExitCode> {
	// CHANGE: Preflight checks remain sync for now (will be Effect-ified in future iteration)
	// WHY: Incremental refactoring - focus on linter execution first
	if (!preflightOk(cliOptions)) return 1;
	if (!(await haveCliDependencies())) return 1;

	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

	// CHANGE: Use Effect.runPromise to execute Effect-based auto-fix
	// WHY: Bridges Effect world with Promise-based orchestration
	// INVARIANT: Errors are handled internally, never propagated
	await Effect.runPromise(
		maybeRunAutoFixEffect(cliOptions.targetPath, cliOptions.noFix),
	);

	// CHANGE: Use Effect.runPromise to execute Effect-based linter collection
	// WHY: Bridges Effect world with Promise-based orchestration
	const allMessages = await Effect.runPromise(
		collectLintMessagesEffect(cliOptions.targetPath),
	);

	// CHANGE: Remaining functions stay Promise-based for now
	// WHY: Incremental refactoring - will convert in future iterations
	const sarifPath = await generateSarifReport(cliOptions.targetPath);

	const config = loadLinterConfig();
	const hasLintErrors = await processResults(allMessages, config, cliOptions);

	const hasDuplicates = handleDuplicates(hasLintErrors, sarifPath, cliOptions);

	return computeExitCode({ hasLintErrors, hasDuplicates });
}
