// CHANGE: Extracted CLI argument parsing from lint.ts
// WHY: CLI parsing logic should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { CLIOptions } from "../types/index.js";

/**
 * Парсит аргументы командной строки.
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
	let targetPath = ".";
	let maxClones = 15;
	let width = process.stdout.columns || 120;
	let context: number | undefined;
	let noFix = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--max-clones" && i + 1 < args.length) {
			const nextArg = args[i + 1];
			if (nextArg) {
				maxClones = Number.parseInt(nextArg, 10);
			}
			i++;
		} else if (arg === "--width" && i + 1 < args.length) {
			const nextArg = args[i + 1];
			if (nextArg) {
				width = Number.parseInt(nextArg, 10);
			}
			i++;
		} else if (arg === "--context" && i + 1 < args.length) {
			const nextArg = args[i + 1];
			if (nextArg) {
				context = Number.parseInt(nextArg, 10);
			}
			i++;
		} else if (arg === "--no-fix") {
			noFix = true;
		} else if (arg && !arg.startsWith("--")) {
			targetPath = arg;
		}
	}

	return { targetPath, maxClones, width, context, noFix };
}
