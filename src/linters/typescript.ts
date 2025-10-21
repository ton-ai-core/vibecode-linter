// CHANGE: Extracted TypeScript diagnostics from lint.ts
// WHY: TypeScript compiler checks should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1078-1166

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

import type { TypeScriptMessage } from "../types/index";
import { extractStdoutFromError } from "../types/index";

const execAsync = promisify(exec);

/**
 * Получает диагностику TypeScript.
 *
 * @param targetPath Путь для проверки (используется для фильтрации)
 * @returns Promise с массивом сообщений
 *
 * @invariant targetPath не пустой
 */
// CHANGE: Extracted helper to parse single TypeScript error line
// WHY: Reduces complexity and max-depth of getTypeScriptDiagnostics
// QUOTE(LINT): "Function has a complexity of 13, max-depth of 5"
// REF: ESLint complexity, max-depth
// SOURCE: n/a
function parseTypeScriptErrorLine(line: string): TypeScriptMessage | null {
	const match = line.match(
		/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/,
	);

	if (!match) {
		return null;
	}

	// CHANGE: Avoid destructuring to possibly undefined groups; normalize explicitly
	// WHY: noUncheckedIndexedAccess + strict types — groups may be undefined
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX
	const filePath = match[1] ?? "";
	const lineStr = match[2] ?? "";
	const colStr = match[3] ?? "";
	const code = match[5] ?? "";
	const message = match[6] ?? "";

	// CHANGE: Replace multiple string emptiness checks with aggregate predicate
	// WHY: Reduce cyclomatic complexity per rule threshold while preserving invariants
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, ESLint complexity
	const fields = [filePath, lineStr, colStr, code, message];
	if (fields.some((f) => f.length === 0)) {
		return null;
	}

	return {
		code: `TS${code}`,
		severity: 2,
		message,
		line: Number.parseInt(lineStr, 10),
		column: Number.parseInt(colStr, 10),
		source: "typescript",
		filePath,
	};
}

// CHANGE: Extracted helper to parse stdout from tsc
// WHY: Reduces complexity of getTypeScriptDiagnostics
// QUOTE(LINT): "Function has a complexity of 13. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function parseTypeScriptOutput(stdout: string): TypeScriptMessage[] {
	const messages: TypeScriptMessage[] = [];
	const lines = stdout.split("\n");

	for (const line of lines) {
		const parsed = parseTypeScriptErrorLine(line);
		if (parsed) {
			messages.push(parsed);
		}
	}

	return messages;
}

/**
 * Получает диагностику TypeScript.
 *
 * CHANGE: Refactored to reduce complexity and max-depth
 * WHY: Original function had complexity 13 and max-depth 5
 * QUOTE(LINT): "Function has a complexity of 13, max-depth of 5"
 * REF: ESLint complexity, max-depth
 * SOURCE: n/a
 *
 * @param targetPath Путь для проверки (используется для фильтрации)
 * @returns Promise с массивом сообщений
 *
 * @invariant targetPath не пустой
 */
export async function getTypeScriptDiagnostics(
	targetPath: string,
): Promise<ReadonlyArray<TypeScriptMessage>> {
	try {
		const command = `npx tsc --noEmit --pretty false`;
		await execAsync(command);
		return [];
	} catch (error) {
		// CHANGE: Use shared helper to extract stdout from exec errors
		// WHY: Remove duplicated pattern across modules (jscpd hit)
		// QUOTE(ТЗ): "Убрать дубли кода"
		// REF: REQ-LINT-FIX, extractStdoutFromError
		const stdout = extractStdoutFromError(error as Error);
		if (typeof stdout !== "string" || stdout.trim().length === 0) {
			return [];
		}
		const messages = parseTypeScriptOutput(stdout);
		return filterMessagesByPath(messages, targetPath);
	}
}

/**
 * Фильтрует сообщения по целевому пути.
 *
 * @param messages Массив сообщений
 * @param targetPath Целевой путь
 * @returns Отфильтрованные сообщения
 */
function filterMessagesByPath(
	messages: ReadonlyArray<TypeScriptMessage>,
	targetPath: string,
): ReadonlyArray<TypeScriptMessage> {
	// If targetPath is current directory, show all messages
	if (targetPath === ".") {
		return messages;
	}

	// If targetPath is a specific file, show only messages from that file
	if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx")) {
		const resolvedTarget = path.resolve(targetPath);
		return messages.filter((msg) => {
			const resolvedFile = path.resolve(msg.filePath);
			return resolvedFile === resolvedTarget;
		});
	}

	// If targetPath is a directory, show only messages from files in that directory
	const resolvedTarget = path.resolve(targetPath);
	// CHANGE: Use template literals instead of string concatenation
	// WHY: Biome prefers template literals for better readability
	// REF: lint/style/useTemplate
	// SOURCE: https://biomejs.dev/linter/rules/lint/style/useTemplate
	return messages.filter((msg) => {
		const resolvedFile = path.resolve(msg.filePath);
		return (
			resolvedFile.startsWith(`${resolvedTarget}${path.sep}`) ||
			resolvedFile.startsWith(`${resolvedTarget}/`)
		);
	});
}
