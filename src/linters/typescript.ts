// CHANGE: Extracted TypeScript diagnostics from lint.ts
// WHY: TypeScript compiler checks should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1078-1166

import { exec } from "child_process";
import * as path from "path";
import { promisify } from "util";

import type { ExecError, TypeScriptMessage } from "../types/index.js";

const execAsync = promisify(exec);

/**
 * Получает диагностику TypeScript.
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
		// CHANGE: Always compile the entire project for complete type validation
		// WHY: Running tsc on individual files loses type context and hides incompatibility errors
		// QUOTE(SPEC): "TS2322 in bcsUnified.ts is missed unless the whole project is type-checked"
		// REF: user-msg-lint-missing-type-errors
		// SOURCE: TypeScript compiler behavior
		const command = `npx tsc --noEmit --pretty false`;
		await execAsync(command);
		return []; // No errors if tsc succeeds
	} catch (error) {
		const messages: TypeScriptMessage[] = [];

		// TypeScript outputs errors to stdout, not stderr
		if (error && typeof error === "object" && "stdout" in error) {
			const stdout = (error as ExecError).stdout;
			if (!stdout) {
				return [];
			}
			const lines = stdout.split("\n");

			for (const line of lines) {
				// Parse TypeScript error/warning format: "file.ts(line,col): error TS2554: message" or "file.ts(line,col): warning TS1234: message"
				const match = line.match(
					/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/,
				);
				if (match) {
					const [, filePath, lineStr, colStr, , code, message] = match;
					if (filePath && lineStr && colStr && code && message) {
						messages.push({
							code: `TS${code}`,
							severity: 2, // TypeScript errors and warnings are displayed as errors
							message,
							line: Number.parseInt(lineStr, 10),
							column: Number.parseInt(colStr, 10),
							source: "typescript",
							filePath,
						});
					}
				}
			}
		}

		// Filter messages based on target path
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
	return messages.filter((msg) => {
		const resolvedFile = path.resolve(msg.filePath);
		return (
			resolvedFile.startsWith(resolvedTarget + path.sep) ||
			resolvedFile.startsWith(resolvedTarget + "/")
		);
	});
}
