// CHANGE: Introduce Application layer orchestration (APP) separated from SHELL and CORE
// WHY: Enforce FCIS — APP composes pure CORE logic with SHELL integrations (to be abstracted as services later)
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"; "CORE никогда не вызывает SHELL"; "Зависимости: SHELL → CORE"
// REF: Architecture plan (Iteration 1)
// PURITY: APP (no process.exit here; minimal console usage will be moved to ConsoleService in Iteration 2)
// INVARIANT: Returns ExitCode as value; no termination side effects
// COMPLEXITY: O(n + m) where n = files inspected, m = diagnostics processed

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
 * @pure false (runs external tools) — will be moved behind services in Iteration 2
 * @complexity O(n + m) where n=files, m=diagnostics
 */
async function collectLintMessages(
	targetPath: string,
): Promise<LintMessageWithFile[]> {
	const [eslintResults, biomeResults, tsMessages] = await Promise.all([
		getESLintResults(targetPath),
		getBiomeDiagnostics(targetPath),
		getTypeScriptDiagnostics(targetPath),
	]);

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
 * @pure false (runs external tools)
 */
async function maybeRunAutoFix(
	targetPath: string,
	noFix: boolean,
): Promise<void> {
	if (noFix) return;
	await Promise.all([runESLintFix(targetPath), runBiomeFix(targetPath)]);
}

/**
 * Orchestrates the linter run and returns ExitCode as value (no process.exit).
 *
 * @param cliOptions - Parsed CLI options
 * @returns ExitCode (0 | 1)
 *
 * @pure false (coordinates effects), but does not terminate the process
 * @invariant ExitCode ∈ {0,1}
 * @postcondition (hasLintErrors ∨ hasDuplicates) → 1 else 0
 */
export async function runLinter(cliOptions: CLIOptions): Promise<ExitCode> {
	if (!preflightOk(cliOptions)) return 1;
	if (!(await haveCliDependencies())) return 1;

	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

	await maybeRunAutoFix(cliOptions.targetPath, cliOptions.noFix);

	const allMessages = await collectLintMessages(cliOptions.targetPath);
	const sarifPath = await generateSarifReport(cliOptions.targetPath);

	const config = loadLinterConfig();
	const hasLintErrors = await processResults(allMessages, config, cliOptions);

	const hasDuplicates = handleDuplicates(hasLintErrors, sarifPath, cliOptions);

	return computeExitCode({ hasLintErrors, hasDuplicates });
}
