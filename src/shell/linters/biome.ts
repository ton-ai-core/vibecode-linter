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
		const biomeFixCommand = `npx biome check --write "${targetPath}"`;
		console.log(`🔧 Running Biome auto-fix on: ${targetPath}`);
		// CHANGE: Log exact Biome CLI command for reproducibility
		// WHY: Allows manual reruns that mirror automatic auto-fix behavior
		// QUOTE(USER-LOG-CMDS): "Хочу добавить это в лог ... Что бы если что я мог бы повторить этот результат"
		// REF: USER-LOG-CMDS
		// SOURCE: n/a
		// FORMAT THEOREM: ∀target: autoFix(target) uses same biomeFixCommand(target) in every pass
		// PURITY: SHELL
		// INVARIANT: Logged command equals the one executed inside each attempt
		// COMPLEXITY: O(1)
		console.log(`   ↳ Command: ${biomeFixCommand}`);

		const maxAttempts = 3;

		// CHANGE: Use Effect.forEach for sequential execution of fix passes
		// WHY: Makes iteration explicit with Effect composition
		// INVARIANT: Executes exactly maxAttempts passes
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			yield* Effect.tryPromise({
				try: async () => execAsync(biomeFixCommand),
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
): Effect.Effect<readonly BiomeResult[], ExternalToolError | ParseError> {
	return Effect.gen(function* () {
		// CHANGE: Use Effect.promise to always get stdout (even on non-zero exit)
		// WHY: Biome returns non-zero on lint errors but with valid JSON
		const biomeDiagnosticsCommand = `npx biome check "${targetPath}" --reporter=json`;
		// CHANGE: Log Biome diagnostics invocation when it actually executes
		// WHY: Display reproducible command inline instead of at start
		// QUOTE(USER-LOG-CMDS): "как только их вызывает он бы писал что за команду"
		// REF: USER-LOG-CMDS
		// SOURCE: n/a
		// FORMAT THEOREM: ∀target: logged command equals CLI invoked
		// PURITY: SHELL
		// INVARIANT: Message emitted once per diagnostics run
		// COMPLEXITY: O(1)
		console.log(`🧪 Running Biome diagnostics on: ${targetPath}`);
		console.log(`   ↳ Command: ${biomeDiagnosticsCommand}`);
		const stdout = yield* Effect.promise(async () => {
			try {
				const result = await execAsync(biomeDiagnosticsCommand);
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
		const parsed = yield* Effect.sync(() => parseBiomeOutput(stdout));

		// CHANGE: Trigger fallback only when Biome JSON is invalid (parsed=false)
		// WHY: Avoid spurious per-file scans when Biome simply found no diagnostics
		// QUOTE(RTM-BIOME-FALLBACK): "Не показывать fallback, если Biome вернул пустой, но валидный отчёт"
		// REF: RTM-BIOME-FALLBACK
		const shouldFallback =
			!parsed.parsed &&
			!targetPath.endsWith(".ts") &&
			!targetPath.endsWith(".tsx");
		if (shouldFallback) {
			console.log("🔄 Biome: Falling back to individual file checking...");
			return yield* getBiomeDiagnosticsPerFileEffect(targetPath);
		}

		return parsed.diagnostics;
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
): Effect.Effect<readonly BiomeResult[], ExternalToolError> {
	return Effect.gen(function* () {
		const files = yield* listBiomeTargetFiles(targetPath);
		return yield* collectPerFileDiagnostics(files);
	});
}

// CHANGE: Extracted file listing effect for Biome per-file fallback
// WHY: Keep getBiomeDiagnosticsPerFileEffect under max-lines while isolating IO concerns
// QUOTE(LINT): "Function 'getBiomeDiagnosticsPerFileEffect' has too many lines (51). Maximum allowed is 50."
// REF: ESLint max-lines-per-function
// SOURCE: n/a
// FORMAT THEOREM: ∀targetPath: listBiomeTargetFiles(targetPath).length ≤ 20
// PURITY: SHELL
// EFFECT: Effect<ReadonlyArray<string>, ExternalToolError>
// INVARIANT: Returned list contains only non-empty .ts/.tsx paths
// COMPLEXITY: O(n) where n = matched files (bounded by head -20)
const listBiomeTargetFiles = (
	targetPath: string,
): Effect.Effect<readonly string[], ExternalToolError> =>
	Effect.promise(async () => {
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
		Effect.map((lsOutput) =>
			pipe(lsOutput.stdout.trim().split("\n"), (lines) =>
				lines.filter((f) => f.trim().length > 0),
			),
		),
	);

// CHANGE: Extracted per-file aggregation logic
// WHY: Maintain single responsibility and keep orchestrator slim
// QUOTE(LINT): "Function 'getBiomeDiagnosticsPerFileEffect' has too many lines (51). Maximum allowed is 50."
// REF: ESLint max-lines-per-function
// SOURCE: n/a
// FORMAT THEOREM: ∀files: collectPerFileDiagnostics(files)=⋃ runBiomeCheckForFile(file)
// PURITY: SHELL
// EFFECT: Effect<ReadonlyArray<BiomeResult>, never>
// INVARIANT: Results preserve concatenation order of input files
// COMPLEXITY: O(n) where n = |files|
const collectPerFileDiagnostics = (
	files: readonly string[],
): Effect.Effect<readonly BiomeResult[], never> =>
	Effect.gen(function* () {
		const allResults: BiomeResult[] = [];
		for (const file of files) {
			const diagnostics = yield* runBiomeCheckForFile(file);
			allResults.push(...diagnostics);
		}
		return allResults;
	});

// CHANGE: Isolated single-file Biome execution with parse guard
// WHY: Reuse per file and keep control flow explicit
// QUOTE(RTM-BIOME-FALLBACK): "Не показывать fallback, если Biome вернул пустой, но валидный отчёт"
// REF: RTM-BIOME-FALLBACK
// SOURCE: n/a
// FORMAT THEOREM: stdout="" → diagnostics=[]
// PURITY: SHELL
// EFFECT: Effect<ReadonlyArray<BiomeResult>, never>
// INVARIANT: parsed=false ⇒ emitted diagnostics=[]
// COMPLEXITY: O(1) per file (Biome CLI dominates)
const runBiomeCheckForFile = (
	file: string,
): Effect.Effect<readonly BiomeResult[], never> =>
	Effect.promise(async () => {
		try {
			const result = await execAsync(
				`npx biome check "${file}" --reporter=json`,
			);
			return result.stdout;
		} catch (error) {
			const stdout = extractStdoutFromError(error as Error);
			return stdout ?? "";
		}
	})
		.pipe(Effect.catchAll(() => Effect.succeed("")))
		.pipe(
			Effect.flatMap((stdout) =>
				Effect.sync(() => {
					if (stdout.length === 0) {
						return [];
					}
					const parsed = parseBiomeOutput(stdout);
					if (!parsed.parsed) {
						console.warn(`⚠️ Biome JSON parse failed for ${file}; skipping.`);
						return [];
					}
					return parsed.diagnostics;
				}),
			),
		);
