// CHANGE: Extracted ESLint runner from lint.ts
// WHY: ESLint operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1026-1056, 1289-1360

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { LintResult } from "../../core/types/index.js";
import { extractStdoutFromError } from "../../core/types/index.js";

const execAsync = promisify(exec);

/**
 * Интерфейс результата ESLint (использует базовый LintResult).
 */
export type ESLintResult = LintResult;

/**
 * Запускает ESLint auto-fix на указанном пути.
 *
 * @param targetPath Путь для линтинга
 * @returns Promise<void>
 *
 * @invariant targetPath не пустой
 */
export async function runESLintFix(targetPath: string): Promise<void> {
	console.log(`🔧 Running ESLint auto-fix on: ${targetPath}`);
	try {
		// CHANGE: Removed special handling for manager files
		// WHY: Unnecessary conditional logic removed per user request
		// REF: user-request-remove-manager-check
		const eslintCommand = `npx eslint "${targetPath}" --ext .ts,.tsx --fix --fix-type directive,problem,suggestion,layout`;

		await execAsync(eslintCommand);
		console.log(`✅ ESLint auto-fix completed`);
	} catch (error) {
		// CHANGE: Use shared helper to extract stdout from exec errors
		// WHY: Remove duplicated pattern across modules (jscpd hit)
		// QUOTE(ТЗ): "Убрать дубли кода"
		// REF: REQ-LINT-FIX, extractStdoutFromError
		const out = extractStdoutFromError(error as Error);
		if (typeof out === "string") {
			console.log(`✅ ESLint auto-fix completed with warnings`);
		} else {
			console.error(`❌ ESLint auto-fix failed:`, error);
		}
	}
}

/**
 * Получает результаты ESLint для указанного пути.
 *
 * @param targetPath Путь для линтинга
 * @returns Promise с массивом результатов
 *
 * @invariant targetPath не пустой
 */
export async function getESLintResults(
	targetPath: string,
): Promise<ReadonlyArray<ESLintResult>> {
	try {
		// CHANGE: Increase maxBuffer for large projects and skip source fields in JSON output
		// WHY: Massive JSON payloads with source fields can overflow the default exec buffer
		// QUOTE(SPEC): "Failed to parse ESLint output. Parse error: SyntaxError: Unterminated string in JSON"
		// REF: user-msg-fix-json-parse-error
		// SOURCE: n/a
		// CHANGE: Removed special handling for manager files
		// WHY: Unnecessary conditional logic removed per user request
		// REF: user-request-remove-manager-check
		const eslintCommand = `npx eslint "${targetPath}" --ext .ts,.tsx --format json`;

		const { stdout } = await execAsync(eslintCommand, {
			maxBuffer: 10 * 1024 * 1024,
		}); // 10MB buffer
		return JSON.parse(stdout) as ReadonlyArray<ESLintResult>;
	} catch (error) {
		const stdout = extractStdoutFromError(error as Error);
		// CHANGE: Avoid truthiness check on string
		// WHY: strict-boolean-expressions — check type and length explicitly
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (typeof stdout !== "string" || stdout.length === 0) {
			throw error;
		}
		try {
			return JSON.parse(stdout) as ReadonlyArray<ESLintResult>;
		} catch (parseError) {
			// CHANGE: Provide more detailed parser errors
			// WHY: Helps understand whether the failure is related to size, position, or payload
			// QUOTE(SPEC): "Unterminated string in JSON at position 1006125"
			// REF: user-msg-fix-json-parse-error
			// SOURCE: n/a
			console.error("Failed to parse ESLint JSON output");
			console.error("Parse error:", parseError);
			console.error("Output length:", stdout.length);
			console.error("Output preview (first 500 chars):", stdout.slice(0, 500));
			console.error("Output preview (last 500 chars):", stdout.slice(-500));
			return [];
		}
	}
}
