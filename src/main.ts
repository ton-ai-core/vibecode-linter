// CHANGE: Main coordination logic extracted from lint.ts
// WHY: Separation of CLI entry point from business logic
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts main logic

import { loadLinterConfig, parseCLIArgs } from "./config/index.js";
import {
	getBiomeDiagnostics,
	getESLintResults,
	getTypeScriptDiagnostics,
	runBiomeFix,
	runESLintFix,
} from "./linters/index.js";
import {
	displayClonesFromSarif,
	generateSarifReport,
	parseSarifReport,
	processResults,
} from "./output/index.js";
import type { LintMessageWithFile } from "./types/index.js";
import {
	checkDependencies,
	reportMissingDependencies,
} from "./utils/dependencies.js";

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
	const depCheck = await checkDependencies();
	if (!depCheck.allAvailable) {
		reportMissingDependencies(depCheck.missing);
		process.exit(1);
	}

	const cliOptions = parseCLIArgs();
	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

	if (!cliOptions.noFix) {
		await Promise.all([
			runESLintFix(cliOptions.targetPath),
			runBiomeFix(cliOptions.targetPath),
		]);
	}

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
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
