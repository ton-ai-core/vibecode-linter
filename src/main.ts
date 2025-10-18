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

/**
 * Главная функция линтера.
 */
export async function main(): Promise<void> {
	// CHANGE: Check required dependencies before running linter
	// WHY: Fail early with clear message if tools are not installed
	// QUOTE(USER): "Надо проверять установлены ли они. Если не установлены говорить об их установке"
	// REF: user-request-check-dependencies
	// SOURCE: n/a
	const depCheck = await checkDependencies();
	if (!depCheck.allAvailable) {
		reportMissingDependencies(depCheck.missing);
		process.exit(1);
	}

	const cliOptions = parseCLIArgs();
	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

	// CHANGE: Added --no-fix flag to allow skipping auto-fixes
	// WHY: Users sometimes need to inspect errors without automatic changes
	// QUOTE(SPEC): "Allow lint.ts to report issues in /src/exchanges without fixing them"
	// REF: user-msg-lint-not-showing-errors
	// SOURCE: n/a
	if (!cliOptions.noFix) {
		// First run ESLint and Biome fixes in parallel
		await Promise.all([
			runESLintFix(cliOptions.targetPath),
			runBiomeFix(cliOptions.targetPath),
		]);
	}

	// Then run ESLint, Biome, and TypeScript in parallel for remaining issues
	const [eslintResults, biomeResults, tsMessages] = await Promise.all([
		getESLintResults(cliOptions.targetPath),
		getBiomeDiagnostics(cliOptions.targetPath),
		getTypeScriptDiagnostics(cliOptions.targetPath),
	]);

	// Always generate SARIF report for duplicates
	const sarifPath = await generateSarifReport();

	// Combine all messages
	const allMessages: LintMessageWithFile[] = [];

	// Add ESLint messages
	for (const result of eslintResults) {
		for (const message of result.messages) {
			allMessages.push({
				...message,
				filePath: result.filePath,
				source: "eslint" as const,
			});
		}
	}

	// Add Biome messages
	for (const result of biomeResults) {
		for (const message of result.messages) {
			allMessages.push({
				...message,
				filePath: result.filePath,
				source: "biome" as const,
			});
		}
	}

	// Add TypeScript messages
	for (const message of tsMessages) {
		allMessages.push({
			...message,
			filePath: message.filePath,
			source: "typescript" as const,
		});
	}

	const config = loadLinterConfig();
	const hasLintErrors = await processResults(allMessages, config, cliOptions);

	// Always generate SARIF but only display duplicates when there are no lint errors
	const duplicates = parseSarifReport(sarifPath);
	const hasDuplicates = duplicates.length > 0;

	if (!hasLintErrors) {
		// Show duplicates only when there are no lint errors
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

	// Exit with error if there are lint errors OR duplicates (when no lint errors)
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
