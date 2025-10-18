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
	if (error && typeof error === "object" && "stdout" in error) {
		const stdout = (error as ExecError).stdout;
		if (!stdout || stdout.trim() === "") {
			return null;
		}
		return stdout;
	}
	return null;
}
