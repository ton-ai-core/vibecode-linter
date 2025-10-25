// CHANGE: Common exec error handling helper
// WHY: Eliminates duplicate error handling pattern across linters
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { ExecError } from "./config.js";

/**
 * Обрабатывает ошибку выполнения команды, возвращая stdout если доступен.
 *
 * @param error Ошибка выполнения
 * @returns stdout или null
 *
 * @pure true
 * @invariant error is (Error | { stdout?: string }) → error !== null (type guarantee)
 * @invariant "stdout" in error ∧ stdout !== undefined → typeof stdout === "string" (type guarantee)
 */
export function extractStdoutFromError(
	error: Error | { stdout?: string },
): string | null {
	// CHANGE: Trust type system, remove defensive checks
	// WHY: Type Error | { stdout?: string } guarantees non-null and correct types
	// INVARIANT: Type system ensures error !== null and stdout?: string
	if (!("stdout" in error)) {
		return null;
	}
	const stdout = (error as ExecError).stdout;
	// Type system guarantees stdout is string | undefined
	// Only need to check for undefined and empty values
	if (stdout === undefined || stdout.trim().length === 0) {
		return null;
	}
	return stdout;
}
