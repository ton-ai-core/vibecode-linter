// CHANGE: Extract duplicate reporting into dedicated module
// WHY: runLinter.ts exceeded 300 lines; duplicate handling is independent of lint pipeline
// QUOTE(ТЗ): "300 lines max per file"
// REF: Architecture plan - FCIS, single-responsibility modules
// PURITY: SHELL-adjacent (console output + fs cleanup); no CORE mutation
// EFFECT: synchronous (side-effecting); will be Effect-ified in Iteration 2
// INVARIANT: Always cleans up SARIF artifacts, regardless of duplicates presence
// COMPLEXITY: O(n) where n = duplicate clones found

import type { CLIOptions } from "../core/types/index.js";
import {
	cleanupReportsArtifacts,
	displayClonesFromSarif,
	parseSarifReport,
} from "../shell/output/index.js";

/**
 * Handle duplicate reporting and cleanup of SARIF artifacts.
 *
 * @pure false (console output, fs cleanup) — will be moved behind services
 * @param hasLintErrors - whether lint step produced errors (suppresses output if true)
 * @param sarifPath - path to SARIF report file
 * @param cliOptions - CLI options for display config
 * @returns true if duplicates were found, false otherwise
 */
export function handleDuplicates(
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
