// CHANGE: Extracted Biome runner from lint.ts
// WHY: Biome operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1058-1073, 1362-1556

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";

import type { LintResult } from "../types/index.js";
import { extractStdoutFromError } from "../types/index.js";
import type {
	BiomeMessagePart,
	BiomeOutput,
	BiomeSpan,
} from "./biome-types.js";

const execAsync = promisify(exec);

/**
 * Интерфейс результата Biome (использует базовый LintResult).
 */
export type BiomeResult = LintResult;

/**
 * Запускает Biome auto-fix на указанном пути.
 *
 * @param targetPath Путь для линтинга
 * @returns Promise<void>
 *
 * @invariant targetPath не пустой
 */
export async function runBiomeFix(targetPath: string): Promise<void> {
	console.log(`🔧 Running Biome auto-fix on: ${targetPath}`);
	try {
		await execAsync(`npx biome check --write "${targetPath}"`);
		console.log(`✅ Biome auto-fix completed`);
	} catch (error) {
		if (error && typeof error === "object" && "stdout" in error) {
			console.log(`✅ Biome auto-fix completed with warnings`);
		} else {
			console.error(`❌ Biome auto-fix failed:`, error);
		}
	}
}

/**
 * Получает диагностику Biome для указанного пути.
 *
 * @param targetPath Путь для линтинга
 * @returns Promise с массивом результатов
 *
 * @invariant targetPath не пустой
 */
/**
 * Обрабатывает результаты Biome с fallback на проверку отдельных файлов.
 */
async function handleBiomeResults(
	results: ReadonlyArray<BiomeResult>,
	targetPath: string,
): Promise<ReadonlyArray<BiomeResult>> {
	if (results.length > 0) {
		return results;
	}

	// If no results and path is directory, try individual files
	if (!targetPath.endsWith(".ts") && !targetPath.endsWith(".tsx")) {
		console.log("🔄 Biome: Falling back to individual file checking...");
		return getBiomeDiagnosticsPerFile(targetPath);
	}

	return results;
}

export async function getBiomeDiagnostics(
	targetPath: string,
): Promise<ReadonlyArray<BiomeResult>> {
	try {
		const { stdout } = await execAsync(
			`npx biome check "${targetPath}" --reporter=json`,
		);

		const results = parseBiomeOutput(stdout);

		return handleBiomeResults(results, targetPath);
	} catch (error) {
		const stdout = extractStdoutFromError(error as Error);
		if (!stdout) {
			console.error("❌ Biome diagnostics failed:", error);
			return [];
		}

		const results = parseBiomeOutput(stdout);
		return handleBiomeResults(results, targetPath);
	}
}

/**
 * Получает диагностику Biome для каждого файла отдельно.
 *
 * @param targetPath Путь к директории
 * @returns Promise с массивом результатов
 */
async function getBiomeDiagnosticsPerFile(
	targetPath: string,
): Promise<ReadonlyArray<BiomeResult>> {
	try {
		// Get TypeScript files in the target path
		const { stdout: lsOutput } = await execAsync(
			`find "${targetPath}" -name "*.ts" -o -name "*.tsx" | head -20`,
		);

		const files = lsOutput
			.trim()
			.split("\n")
			.filter((f) => f.trim().length > 0);
		const allResults: BiomeResult[] = [];

		for (const file of files) {
			try {
				const { stdout } = await execAsync(
					`npx biome check "${file}" --reporter=json`,
				);
				const results = parseBiomeOutput(stdout);
				allResults.push(...results);
			} catch (fileError) {
				const stdout = extractStdoutFromError(fileError as Error);
				if (stdout) {
					const results = parseBiomeOutput(stdout);
					allResults.push(...results);
				}
				// Continue with other files if one fails
			}
		}

		return allResults;
	} catch (error) {
		console.error("Failed to get individual file diagnostics:", error);
		return [];
	}
}

/**
 * Парсит вывод Biome в JSON формате.
 *
 * @param stdout Вывод Biome
 * @returns Массив результатов
 */
function parseBiomeOutput(stdout: string): ReadonlyArray<BiomeResult> {
	try {
		const biomeOutput = JSON.parse(stdout) as BiomeOutput;
		const results: BiomeResult[] = [];

		// Handle Biome's diagnostic format
		if (biomeOutput.diagnostics && Array.isArray(biomeOutput.diagnostics)) {
			for (const item of biomeOutput.diagnostics) {
				// Type assertion for dynamic Biome JSON structure
				const diagnostic = item as {
					severity: string;
					location?: {
						path?: { file?: string };
						span?: BiomeSpan | readonly [number, number];
					};
					category?: string;
					description?: string;
					message?: string | ReadonlyArray<string | BiomeMessagePart>;
					title?: string;
				};

				// CHANGE: Map information-level to severity 0 (lowest priority)
				// WHY: Show information only after errors and warnings are fixed
				// REF: user-request-smart-priority-system
				// Do not skip information - map to severity 0 instead

				// Extract file path from diagnostic - Biome uses different structure
				const filePath = diagnostic.location?.path?.file || "";

				// Parse message from diagnostic
				let messageText = "";
				if (typeof diagnostic.description === "string") {
					messageText = diagnostic.description;
				} else if (diagnostic.message) {
					if (Array.isArray(diagnostic.message)) {
						messageText = diagnostic.message
							.map((m: string | BiomeMessagePart) =>
								typeof m === "string" ? m : m.content || "",
							)
							.join(" ");
					} else if (typeof diagnostic.message === "string") {
						messageText = diagnostic.message;
					}
				} else if (diagnostic.title) {
					messageText = diagnostic.title;
				}

				// Helper functions for proper UTF-8 byte offset handling
				const enc = new TextEncoder();
				const dec = new TextDecoder("utf-8");

				const toSpan = (
					span: BiomeSpan | readonly [number, number] | undefined,
				): readonly [number, number] | null => {
					if (!span) {
						return null;
					}
					if (Array.isArray(span) && typeof span[0] === "number") {
						return [span[0], span[1] ?? span[0]];
					}
					if (
						typeof span === "object" &&
						"start" in span &&
						typeof span.start === "number"
					) {
						return [span.start, span.end ?? span.start];
					}
					return null;
				};

				const byteOffToPos = (
					text: string,
					off: number,
				): { line: number; column: number } => {
					const bytes = enc.encode(text);
					const clamped = Math.max(0, Math.min(off >>> 0, bytes.length));
					const prefix = dec.decode(bytes.subarray(0, clamped));
					const nl = prefix.lastIndexOf("\n");
					const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
					const column = nl === -1 ? prefix.length + 1 : prefix.length - nl;
					return { line, column };
				};

				const firstImportOrBOF = (
					text: string,
				): { line: number; column: number } => {
					const idx = text.search(/^(?:import|export)\b/m);
					if (idx >= 0) {
						const off = enc.encode(text.slice(0, idx)).length;
						return byteOffToPos(text, off);
					}
					return { line: 1, column: 1 };
				};

				// Calculate positions using proper UTF-8 byte offset handling
				let line = 1;
				let column = 1;
				let endLine: number | undefined;
				let endColumn: number | undefined;

				let fileText = "";
				try {
					if (filePath) {
						fileText = fs.readFileSync(filePath, "utf8");
					}
				} catch {
					// Ignore file read errors
				}

				const spanData = diagnostic.location?.span;
				const span = toSpan(spanData);
				if (span && fileText) {
					const [s, e] = span;
					const p1 = byteOffToPos(fileText, s);
					const p2 = byteOffToPos(fileText, e);
					line = p1.line;
					column = p1.column;
					endLine = p2.line;
					endColumn = p2.column;
				} else if (
					diagnostic.category === "assist/source/organizeImports" &&
					fileText
				) {
					const p = firstImportOrBOF(fileText);
					line = p.line;
					column = p.column;
				}

				// CHANGE: Map all Biome diagnostics to errors (severity 2)
				// WHY: User wants uniform error reporting, no special treatment for information
				// REF: user-request-uniform-error-format
				const severityNumber = 2;

				const resultMessage = {
					ruleId: diagnostic.category || null,
					severity: severityNumber,
					message: messageText.trim() || "Biome diagnostic",
					line,
					column,
					endLine,
					endColumn,
				};

				let existingResult = results.find((r) => r.filePath === filePath);
				if (!existingResult) {
					existingResult = { filePath, messages: [] };
					results.push(existingResult);
				}
				(existingResult.messages as Array<typeof resultMessage>).push(
					resultMessage,
				);
			}
		}

		return results;
	} catch {
		return [];
	}
}
