// CHANGE: Extracted ESLint runner from lint.ts
// WHY: ESLint operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// PURITY: SHELL
// EFFECT: Effect<LintResult[], ExternalToolError | ParseError>
// SOURCE: lint.ts lines 1026-1056, 1289-1360

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";

import { ExternalToolError, ParseError } from "../../core/errors.js";
import type { LintResult } from "../../core/types/index.js";
import { extractStdoutFromError } from "../../core/types/index.js";
import { extractStdoutOrThrow } from "./linter-helpers.js";

const execAsync = promisify(exec);

/**
 * Интерфейс результата ESLint (использует базовый LintResult).
 */
export type ESLintResult = LintResult;

/**
 * Запускает ESLint auto-fix на указанном пути.
 *
 * CHANGE: Use Effect.gen for typed error handling
 * WHY: Replace Promise + try/catch with Effect
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based SHELL
 *
 * @param targetPath Путь для линтинга
 * @returns Effect с void или typed error
 *
 * @pure false - modifies files via ESLint
 * @effect Effect<void, ExternalToolError>
 * @invariant targetPath не пустой
 */
export function runESLintFix(
	targetPath: string,
): Effect.Effect<void, ExternalToolError> {
	return Effect.gen(function* () {
		const eslintCommand = `npx eslint "${targetPath}" --ext .ts,.tsx --fix`;
		console.log(`🔧 Running ESLint auto-fix on: ${targetPath}`);
		// CHANGE: Surface exact ESLint command for reproducibility
		// WHY: Operator must be able to rerun the same invocation outside vibecode-linter
		// QUOTE(USER-LOG-CMDS): "Я хочу добавить это в лог ... Что бы если что я мог бы повторить этот результат"
		// REF: USER-LOG-CMDS
		// SOURCE: n/a
		// FORMAT THEOREM: ∀target: runESLintFix(target) → shellCommand(target)=eslintCommand(target)
		// PURITY: SHELL
		// INVARIANT: Logged command string matches the exec invocation exactly
		// COMPLEXITY: O(1)
		console.log(`   ↳ Command: ${eslintCommand}`);

		// CHANGE: Use Effect.tryPromise with error recovery
		// WHY: ESLint returns non-zero exit code even on successful fix with warnings
		yield* Effect.tryPromise({
			try: async () => execAsync(eslintCommand),
			catch: (error) => {
				// CHANGE: Check if error has stdout (indicates warnings, not failure)
				// WHY: ESLint --fix succeeds but returns non-zero with warnings
				const out = extractStdoutFromError(error as Error);
				if (typeof out === "string") {
					console.log(`✅ ESLint auto-fix completed with warnings`);
					return undefined; // Success with warnings
				}
				console.error(`❌ ESLint auto-fix failed:`, error);
				return new ExternalToolError({
					tool: "eslint",
					reason: `ESLint auto-fix failed: ${String(error)}`,
				});
			},
		}).pipe(
			Effect.catchAll((err) => {
				// CHANGE: If error is undefined (warnings case), return success
				// WHY: Warnings are acceptable for auto-fix
				if (err === undefined) {
					return Effect.succeed(undefined);
				}
				return Effect.fail(err);
			}),
		);

		console.log(`✅ ESLint auto-fix completed`);
	});
}

/**
 * Получает результаты ESLint для указанного пути.
 *
 * CHANGE: Use Effect.gen for typed async error handling
 * WHY: Replace Promise + try/catch with Effect for provability
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based SHELL
 *
 * @param targetPath Путь для линтинга
 * @returns Effect с массивом результатов или typed error
 *
 * @pure false - executes external process
 * @effect Effect<ESLintResult[], ExternalToolError | ParseError>
 * @invariant targetPath не пустой
 * @complexity O(n) where n = number of files to lint
 */
export function getESLintResults(
	targetPath: string,
): Effect.Effect<ReadonlyArray<ESLintResult>, ExternalToolError | ParseError> {
	return Effect.gen(function* () {
		const eslintCommand = `npx eslint "${targetPath}" --ext .ts,.tsx --format json`;
		// CHANGE: Log ESLint diagnostics invocation exactly when it runs
		// WHY: Give operators immediate visibility into the command they can replay
		// QUOTE(USER-LOG-CMDS): "Я хочу что бы он как только их вызывает он бы писал что за команду"
		// REF: USER-LOG-CMDS
		// SOURCE: n/a
		// FORMAT THEOREM: ∀target: diagnostics(target) prints same command executed
		// PURITY: SHELL
		// INVARIANT: Logged command string equals `eslintCommand`
		// COMPLEXITY: O(1)
		console.log(`🧪 Running ESLint diagnostics on: ${targetPath}`);
		console.log(`   ↳ Command: ${eslintCommand}`);

		// CHANGE: Use Effect.promise to always get stdout (even on non-zero exit)
		// WHY: ESLint returns non-zero on lint errors but with valid JSON
		const stdout = yield* Effect.promise(async () => {
			try {
				const result = await execAsync(eslintCommand, {
					maxBuffer: 10 * 1024 * 1024,
				});
				return result.stdout;
			} catch (error) {
				// CHANGE: Use extractStdoutOrThrow to remove code duplication
				// WHY: Identical pattern in biome.ts (jscpd DUPLICATE #1)
				// REF: linter-helpers.ts, REQ-LINT-FIX
				return extractStdoutOrThrow(error as Error);
			}
		}).pipe(
			Effect.catchAll((error) =>
				Effect.fail(
					new ExternalToolError({
						tool: "eslint",
						reason: `Failed to run ESLint: ${String(error)}`,
					}),
				),
			),
		);

		// CHANGE: Use Effect.try for JSON parsing
		// WHY: JSON.parse can throw, we want typed ParseError
		return yield* Effect.try({
			try: () => JSON.parse(stdout) as ReadonlyArray<ESLintResult>,
			catch: (parseError) => {
				console.error("Failed to parse ESLint JSON output");
				console.error("Parse error:", parseError);
				console.error("Output length:", stdout.length);
				console.error(
					"Output preview (first 500 chars):",
					stdout.slice(0, 500),
				);
				console.error("Output preview (last 500 chars):", stdout.slice(-500));

				return new ParseError({
					entity: "eslint",
					detail: `Failed to parse ESLint JSON: ${String(parseError)}`,
				});
			},
		});
	});
}
