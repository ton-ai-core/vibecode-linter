// CHANGE: Extracted CLI argument parsing from lint.ts
// WHY: CLI parsing logic should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { CLIOptions } from "../../core/types/index.js";

// CHANGE: Extracted result type for argument processing
// WHY: Simplifies control flow in parseCLIArgs
// QUOTE(LINT): "Function has a complexity of 10. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
interface ArgProcessResult {
	readonly maxClones: number;
	readonly width: number;
	readonly context: number | undefined;
	readonly noFix: boolean;
	readonly noPreflight: boolean;
	readonly fixPeers: boolean;
	readonly targetPath: string;
	readonly skipNext: boolean;
}

// CHANGE: Extracted numeric flag handler
// WHY: Reduces complexity by extracting common pattern
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
type NumericFlagHandler = (
	args: readonly string[],
	index: number,
	current: Omit<ArgProcessResult, "skipNext">,
) => ArgProcessResult | null;

// CHANGE: Created handlers for numeric flags
// WHY: Eliminates branching in processArgument
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function createNumericFlagHandler(
	key: "maxClones" | "width" | "context",
): NumericFlagHandler {
	return (args, index, current) => {
		if (index + 1 >= args.length) return null;
		const value = Number.parseInt(args[index + 1] ?? "0", 10);
		return { ...current, [key]: value, skipNext: true };
	};
}

const numericHandlers: Record<string, NumericFlagHandler> = {
	"--max-clones": createNumericFlagHandler("maxClones"),
	"--width": createNumericFlagHandler("width"),
	"--context": createNumericFlagHandler("context"),
};

// CHANGE: Simplified argument processor with handler map
// WHY: Reduces complexity from 12 to under 8 using lookup table
// QUOTE(LINT): "Function has a complexity of 12. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function processArgument(
	arg: string,
	args: readonly string[],
	index: number,
	current: Omit<ArgProcessResult, "skipNext">,
): ArgProcessResult {
	// Try numeric flag handlers
	// CHANGE: Use explicit undefined/null checks
	// WHY: strict-boolean-expressions — function/object truthiness is always true
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	const handler: NumericFlagHandler | undefined = (
		numericHandlers as Record<string, NumericFlagHandler | undefined>
	)[arg];
	if (handler !== undefined) {
		const result = handler(args, index, current);
		if (result !== null) return result;
	}

	// Handle boolean flags
	if (arg === "--no-fix") {
		return { ...current, noFix: true, skipNext: false };
	}
	if (arg === "--no-preflight") {
		// CHANGE: Add --no-preflight flag to bypass environment checks
		// WHY: Allow CI or advanced users to skip preflight explicitly
		// QUOTE(ТЗ): "Добавить CLI флаги"
		// REF: REQ-CLI-PREFLIGHT-PEERS
		return { ...current, noPreflight: true, skipNext: false };
	}
	if (arg === "--fix-peers") {
		// CHANGE: Add --fix-peers flag to print suggested install commands for missing peers
		// WHY: Provide actionable remediation guidance
		// QUOTE(ТЗ): "Писать внятно что необходимо сделать"
		// REF: REQ-CLI-PREFLIGHT-PEERS
		return { ...current, fixPeers: true, skipNext: false };
	}

	// Handle positional argument
	if (!arg.startsWith("--")) {
		return { ...current, targetPath: arg, skipNext: false };
	}

	return { ...current, skipNext: false };
}

/**
 * Парсит аргументы командной строки.
 *
 * CHANGE: Refactored to reduce complexity with processArgument helper
 * WHY: Original function had complexity 10, maximum allowed is 8
 * QUOTE(LINT): "Function has a complexity of 10. Maximum allowed is 8"
 * REF: ESLint complexity
 * SOURCE: n/a
 *
 * @returns Опции командной строки
 *
 * @example
 * ```ts
 * // Command: lint.ts src/file.ts --max-clones 20 --no-fix
 * const options = parseCLIArgs();
 * // Returns: { targetPath: "src/file.ts", maxClones: 20, noFix: true, ... }
 * ```
 */
export function parseCLIArgs(): CLIOptions {
	const args = process.argv.slice(2);
	let state: Omit<ArgProcessResult, "skipNext"> = {
		targetPath: ".",
		maxClones: 15,
		width: process.stdout.columns || 120,
		context: undefined,
		noFix: false,
		noPreflight: false,
		fixPeers: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg: string = args.at(i) ?? "";
		// CHANGE: Avoid truthiness check on string
		// WHY: strict-boolean-expressions — handle empty string explicitly
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (arg.length === 0) continue;

		const result = processArgument(arg, args, i, state);
		state = result;
		if (result.skipNext) {
			i++;
		}
	}

	// CHANGE: Build base result once to remove duplication (jscpd)
	// WHY: Two branches differed только наличием 'context'; дублирование убрано
	// QUOTE(ТЗ): "Разумные рефакторинги без дубликатов"
	// REF: REQ-LINT-FIX
	const { context, ...rest } = state;
	const base: Omit<CLIOptions, "context"> = {
		targetPath: rest.targetPath,
		maxClones: rest.maxClones,
		width: rest.width,
		noFix: rest.noFix,
		noPreflight: rest.noPreflight,
		fixPeers: rest.fixPeers,
	};
	// exactOptionalPropertyTypes: отсутствие поля корректно моделирует "context?: number"
	return context === undefined ? base : { ...base, context };
}
