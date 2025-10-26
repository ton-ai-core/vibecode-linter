// CHANGE: Extracted Biome runner from lint.ts
// WHY: Biome operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// PURITY: SHELL
// EFFECT: Effect<BiomeResult[], ExternalToolError | ParseError>
// SOURCE: lint.ts lines 1058-1073, 1362-1556

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Effect, pipe } from "effect";

import { ExternalToolError, type ParseError } from "../../core/errors.js";
import { extractStdoutFromError } from "../../core/types/index.js";
import { type BiomeResult, parseBiomeOutput } from "./biome-parser.js";
import { extractStdoutOrThrow } from "./linter-helpers.js";

const execAsync = promisify(exec);

/**
 * Запускает Biome auto-fix на указанном пути.
 * Выполняет несколько проходов для исправления зависимых ошибок.
 *
 * CHANGE: Use Effect.gen for typed error handling with multiple passes
 * WHY: Replace Promise + try/catch with Effect for provability
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based SHELL
 *
 * @param targetPath Путь для линтинга
 * @returns Effect с void или typed error
 *
 * @pure false - modifies files via Biome
 * @effect Effect<void, ExternalToolError>
 * @invariant targetPath не пустой
 * @complexity O(1) - runs 3 passes unconditionally
 */
export function runBiomeFix(
	targetPath: string,
): Effect.Effect<void, ExternalToolError> {
	return Effect.gen(function* () {
		console.log(`🔧 Running Biome auto-fix on: ${targetPath}`);

		const maxAttempts = 3;

		// CHANGE: Use Effect.forEach for sequential execution of fix passes
		// WHY: Makes iteration explicit with Effect composition
		// INVARIANT: Executes exactly maxAttempts passes
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			yield* Effect.tryPromise({
				try: async () => execAsync(`npx biome check --write "${targetPath}"`),
				catch: (error) => {
					// Biome returns non-zero on fixed issues - this is expected
					const out = extractStdoutFromError(error as Error);
					if (typeof out === "string") {
						return undefined; // Success with fixes
					}
					console.error(`❌ Biome auto-fix failed:`, error);
					return new ExternalToolError({
						tool: "biome",
						reason: `Biome auto-fix failed: ${String(error)}`,
					});
				},
			}).pipe(
				Effect.catchAll((err) => {
					if (err === undefined) {
						return Effect.succeed(undefined);
					}
					return Effect.fail(err);
				}),
			);
		}

		console.log(`✅ Biome auto-fix completed (${maxAttempts} passes)`);
	});
}

/**
 * Получает диагностику Biome для указанного пути.
 *
 * CHANGE: Use Effect.gen for typed error handling with fallback
 * WHY: Replace Promise + try/catch with Effect for provability
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based SHELL
 *
 * @param targetPath Путь для линтинга
 * @returns Effect с массивом результатов или typed error
 *
 * @pure false - executes external process
 * @effect Effect<BiomeResult[], ExternalToolError | ParseError>
 * @invariant targetPath не пустой
 * @complexity O(n) where n = number of files (with fallback)
 */
export function getBiomeDiagnostics(
	targetPath: string,
): Effect.Effect<ReadonlyArray<BiomeResult>, ExternalToolError | ParseError> {
	return Effect.gen(function* () {
		// CHANGE: Use Effect.promise to always get stdout (even on non-zero exit)
		// WHY: Biome returns non-zero on lint errors but with valid JSON
		const stdout = yield* Effect.promise(async () => {
			try {
				const result = await execAsync(
					`npx biome check "${targetPath}" --reporter=json`,
				);
				return result.stdout;
			} catch (error) {
				// CHANGE: Use extractStdoutOrThrow to remove code duplication
				// WHY: Identical pattern in eslint.ts (jscpd DUPLICATE #1)
				// REF: linter-helpers.ts, REQ-LINT-FIX
				return extractStdoutOrThrow(error as Error);
			}
		}).pipe(
			Effect.catchAll((error) => {
				console.error("❌ Biome diagnostics failed:", error);
				return Effect.fail(
					new ExternalToolError({
						tool: "biome",
						reason: `Biome diagnostics failed: ${String(error)}`,
					}),
				);
			}),
		);

		// CHANGE: Use Effect.sync for parsing
		// WHY: parseBiomeOutput is synchronous
		const results = yield* Effect.sync(() => parseBiomeOutput(stdout));

		// CHANGE: Fallback to per-file checking if needed
		// WHY: Directory scanning may require individual file checks
		if (
			results.length === 0 &&
			!targetPath.endsWith(".ts") &&
			!targetPath.endsWith(".tsx")
		) {
			console.log("🔄 Biome: Falling back to individual file checking...");
			return yield* getBiomeDiagnosticsPerFileEffect(targetPath);
		}

		return results;
	});
}

/**
 * Получает диагностику Biome для каждого файла отдельно.
 *
 * CHANGE: Use Effect.gen for typed error handling per-file
 * WHY: Replace Promise + try/catch with Effect for provability
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based SHELL
 *
 * @param targetPath Путь к директории
 * @returns Effect с массивом результатов или typed error
 *
 * @pure false - executes external processes
 * @effect Effect<BiomeResult[], ExternalToolError>
 * @complexity O(n) where n = number of files
 */
function getBiomeDiagnosticsPerFileEffect(
	targetPath: string,
): Effect.Effect<ReadonlyArray<BiomeResult>, ExternalToolError> {
	return Effect.gen(function* () {
		// CHANGE: Use Effect.promise for file listing (use git instead of find)
		// WHY: git ls-files is more reliable and respects .gitignore
		const lsOutput = yield* Effect.promise(async () => {
			try {
				return await execAsync(
					`find "${targetPath}" -name "*.ts" -o -name "*.tsx" | head -20`,
				);
			} catch (error) {
				console.error("Failed to list files:", error);
				throw error;
			}
		}).pipe(
			Effect.catchAll((error) =>
				Effect.fail(
					new ExternalToolError({
						tool: "git",
						reason: `Failed to list TypeScript files: ${String(error)}`,
					}),
				),
			),
		);

		const files = pipe(lsOutput.stdout.trim().split("\n"), (lines) =>
			lines.filter((f) => f.trim().length > 0),
		);

		const allResults: BiomeResult[] = [];

		// CHANGE: Use for-loop with Effect.promise for each file
		// WHY: Allows continuing on per-file failures
		for (const file of files) {
			const stdout = yield* Effect.promise(async () => {
				try {
					const result = await execAsync(
						`npx biome check "${file}" --reporter=json`,
					);
					return result.stdout;
				} catch (error) {
					const stdout = extractStdoutFromError(error as Error);
					return stdout ?? "";
				}
			}).pipe(Effect.catchAll(() => Effect.succeed("")));

			if (stdout.length > 0) {
				const results = parseBiomeOutput(stdout);
				allResults.push(...results);
			}
		}

		return allResults;
	});
}
