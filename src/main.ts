#!/usr/bin/env node

// CHANGE: Main coordination logic extracted from lint.ts
// WHY: Separation of CLI entry point from business logic
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts main logic

import { checkAndReportPreflight } from "./analysis/preflight";
import { loadLinterConfig, parseCLIArgs } from "./config/index";
import {
	getBiomeDiagnostics,
	getESLintResults,
	getTypeScriptDiagnostics,
	runBiomeFix,
	runESLintFix,
} from "./linters/index";
import {
	displayClonesFromSarif,
	generateSarifReport,
	parseSarifReport,
	processResults,
} from "./output/index";
import type { LintMessageWithFile } from "./types/index";
import {
	checkDependencies,
	reportMissingDependencies,
} from "./utils/dependencies";

// CHANGE: Extracted helper to collect all lint messages
// WHY: Reduces complexity and line count of main
// QUOTE(LINT): "Function has a complexity of 13, too many lines (65)"
// REF: ESLint complexity, max-lines-per-function
// SOURCE: n/a
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

// CHANGE: Extracted helper to handle duplicates display
// WHY: Reduces complexity and line count of main
// QUOTE(LINT): "Function has a complexity of 13, too many lines (65)"
// REF: ESLint complexity, max-lines-per-function
// SOURCE: n/a
function handleDuplicates(
	hasLintErrors: boolean,
	sarifPath: string,
	cliOptions: ReturnType<typeof parseCLIArgs>,
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
			console.log("\n✅ No code duplicates found!");
		}
	}

	return hasDuplicates;
}

// CHANGE: Extract helper to perform preflight and optionally suggest fixes
// WHY: Reduce main() complexity by moving branching logic out
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function maybeExitOnPreflight(
	cliOptions: ReturnType<typeof parseCLIArgs>,
): void {
	if (cliOptions.noPreflight) return;
	const pre = checkAndReportPreflight(process.cwd());
	if (!pre.ok) {
		// Optional aggregated remediation if user asked for it
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
		process.exit(1);
	}
}

// CHANGE: Extract helper to enforce presence of generic CLI tools
// WHY: Keep main() linear and readable
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
async function ensureCLIDependenciesOrExit(): Promise<void> {
	const depCheck = await checkDependencies();
	if (!depCheck.allAvailable) {
		reportMissingDependencies(depCheck.missing);
		process.exit(1);
	}
}

// CHANGE: Extract helper to optionally run auto-fixes
// WHY: Reduce branching in main()
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
async function maybeRunAutoFix(
	targetPath: string,
	noFix: boolean,
): Promise<void> {
	if (noFix) return;
	await Promise.all([runESLintFix(targetPath), runBiomeFix(targetPath)]);
}

/**
 * Главная функция линтера.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 65 lines and complexity 13
 * QUOTE(LINT): "Function has too many lines/complexity"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
 */
export async function main(): Promise<void> {
	const cliOptions = parseCLIArgs();

	// CHANGE: Pre-run environment validation extracted to helper
	// WHY: Reduce cyclomatic complexity of main()
	// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
	// REF: ESLint complexity
	maybeExitOnPreflight(cliOptions);

	// CHANGE: Generic CLI dependency check extracted
	// WHY: Keep main() linear and readable
	// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
	// REF: ESLint complexity
	await ensureCLIDependenciesOrExit();

	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

	// CHANGE: Optional auto-fix execution extracted
	// WHY: Reduce branching in main()
	await maybeRunAutoFix(cliOptions.targetPath, cliOptions.noFix);

	const allMessages = await collectLintMessages(cliOptions.targetPath);
	const sarifPath = await generateSarifReport();

	const config = loadLinterConfig();
	const hasLintErrors = await processResults(allMessages, config, cliOptions);

	const hasDuplicates = handleDuplicates(hasLintErrors, sarifPath, cliOptions);

	if (hasLintErrors || (!hasLintErrors && hasDuplicates)) {
		process.exit(1);
	}
}

// Run main function if this file is executed directly
// CHANGE: Use CommonJS require.main check instead of import.meta.url
// WHY: import.meta.url is ESM-only, CommonJS uses require.main
// QUOTE(USER): "можем ли мы изменить на commonjs?"
// REF: REQ-NPX-COMPATIBILITY
// SOURCE: n/a
if (require.main === module) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
