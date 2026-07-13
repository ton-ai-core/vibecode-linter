// CHANGE: Extract linter collection into dedicated module to enforce 300 lines/file rule
// WHY: runLinter.ts exceeded 300 lines; module split improves cohesion and reviewability
// QUOTE(ТЗ): "300 lines max per file"
// REF: Architecture plan - FCIS, single-responsibility modules
// PURITY: APP (orchestrates SHELL linters; no CORE mutation)
// EFFECT: Effect<LintMessageWithFile[], never>
// INVARIANT: Order-independent collection (commutative under set union of messages)
// COMPLEXITY: O(n + m) where n = files inspected, m = diagnostics per linter

import { Effect } from "effect";

import type { LintMessageWithFile, PackageManager } from "../core/types/index.js";
import {
	getBiomeDiagnostics,
	getESLintResults,
	getTypeScriptDiagnostics,
} from "../shell/linters/index.js";

/**
 * Collect diagnostics from all configured linters in parallel.
 *
 * CHANGE: Use Effect.all for parallel linter execution
 * WHY: Replace Promise.all with Effect.all for typed error handling
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: Architecture plan - Effect-based APP composition
 *
 * @pure false (runs external tools) — will be moved behind services in Iteration 2
 * @effect Effect<LintMessageWithFile[], ExternalToolError | ParseError | InvariantViolation>
 * @complexity O(n + m) where n=files, m=diagnostics
 */
export function collectLintMessagesEffect(
	targetPath: string,
	packageManager: PackageManager,
): Effect.Effect<LintMessageWithFile[]> {
	return Effect.gen(function* () {
		const [eslintResults, biomeResults, tsMessages] = yield* Effect.all(
			[
				getESLintResults(targetPath, packageManager).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
				getBiomeDiagnostics(targetPath, packageManager).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
				getTypeScriptDiagnostics(targetPath, packageManager).pipe(
					Effect.catchAll(() => Effect.succeed([])),
				),
			],
			{ concurrency: "unbounded" },
		);

		const allMessages: LintMessageWithFile[] = [];

		for (const result of eslintResults) {
			for (const message of result.messages) {
				allMessages.push({
					...message,
					filePath: result.filePath,
					source: "eslint" as const,
				});
			}
		}

		for (const result of biomeResults) {
			for (const message of result.messages) {
				allMessages.push({
					...message,
					filePath: result.filePath,
					source: "biome" as const,
				});
			}
		}

		for (const message of tsMessages) {
			allMessages.push({
				...message,
				filePath: message.filePath,
				source: "typescript" as const,
			});
		}

		return allMessages;
	});
}
