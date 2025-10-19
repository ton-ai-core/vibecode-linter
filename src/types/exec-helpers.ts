// CHANGE: Common exec error handling helper
// WHY: Eliminates duplicate error handling pattern across linters
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { ExecError } from "./config";

/**
 * Обрабатывает ошибку выполнения команды, возвращая stdout если доступен.
 *
 * @param error Ошибка выполнения
 * @returns stdout или null
 */
export function extractStdoutFromError(
	error: Error | { stdout?: string },
): string | null {
	// CHANGE: Avoid truthiness and handle object/field presence explicitly
	// WHY: strict-boolean-expressions — forbid using objects/nullable strings in conditionals
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	const hasStdout =
		typeof error === "object" &&
		error !== null &&
		"stdout" in (error as { stdout?: string });
	if (!hasStdout) {
		return null;
	}
	const stdout = (error as ExecError).stdout;
	if (typeof stdout !== "string" || stdout.trim().length === 0) {
		return null;
	}
	return stdout;
}
