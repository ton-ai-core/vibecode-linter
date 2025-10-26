// CHANGE: Extracted Biome output parsing utilities from biome.ts
// WHY: Reduce file size to satisfy max-lines ESLint rule (was 461 lines > 300 limit)
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH, max-lines ESLint rule
// PURITY: CORE (pure parsing functions)
// COMPLEXITY: O(n) where n = diagnostics count

import * as fs from "node:fs";
import type { LintResult } from "../../core/types/index.js";
import type {
	BiomeMessagePart,
	BiomeOutput,
	BiomeSpan,
} from "./biome-types.js";

export type BiomeResult = LintResult;

// CHANGE: Extracted type for Biome diagnostic
// WHY: Improves code organization
// QUOTE(LINT): "Function parseBiomeOutput has too many lines (130)"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
type BiomeDiagnostic = {
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

// CHANGE: Extracted helper to parse diagnostic message
// WHY: Reduces complexity and max-depth of parseBiomeOutput
// QUOTE(LINT): "Function has a complexity of 23, max-depth of 5"
// REF: ESLint complexity, max-depth
// SOURCE: n/a
function parseMessageText(diagnostic: BiomeDiagnostic): string {
	if (typeof diagnostic.description === "string") {
		return diagnostic.description;
	}

	if (
		Array.isArray(diagnostic.message) ||
		typeof diagnostic.message === "string"
	) {
		if (Array.isArray(diagnostic.message)) {
			return diagnostic.message
				.map((m: string | BiomeMessagePart) =>
					typeof m === "string" ? m : (m.content ?? ""),
				)
				.join(" ");
		}
		if (typeof diagnostic.message === "string") {
			return diagnostic.message;
		}
	}

	if (typeof diagnostic.title === "string" && diagnostic.title.length > 0) {
		return diagnostic.title;
	}

	return "";
}

// CHANGE: Extracted UTF-8 byte offset utilities
// WHY: Reduces complexity of parseBiomeOutput
// QUOTE(LINT): "Arrow function has a complexity of 9. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

function isArraySpan(
	span: BiomeSpan | readonly [number, number] | undefined,
): span is readonly [number, number] {
	return Array.isArray(span) && typeof span[0] === "number";
}

function isObjectSpan(
	span: BiomeSpan | readonly [number, number] | undefined,
): span is BiomeSpan {
	return (
		typeof span === "object" &&
		span !== null &&
		"start" in span &&
		typeof span.start === "number"
	);
}

function toSpan(
	span: BiomeSpan | readonly [number, number] | undefined,
): readonly [number, number] | null {
	if (!span) return null;
	if (isArraySpan(span)) return [span[0], span[1] ?? span[0]];
	if (isObjectSpan(span)) return [span.start, span.end ?? span.start];
	return null;
}

function byteOffToPos(
	text: string,
	off: number,
): { line: number; column: number } {
	const bytes = enc.encode(text);
	const clamped = Math.max(0, Math.min(off >>> 0, bytes.length));
	const prefix = dec.decode(bytes.subarray(0, clamped));
	const nl = prefix.lastIndexOf("\n");
	const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
	const column = nl === -1 ? prefix.length + 1 : prefix.length - nl;
	return { line, column };
}

function firstImportOrBOF(text: string): { line: number; column: number } {
	const idx = text.search(/^(?:import|export)\b/m);
	if (idx >= 0) {
		const off = enc.encode(text.slice(0, idx)).length;
		return byteOffToPos(text, off);
	}
	return { line: 1, column: 1 };
}

// CHANGE: Extracted helper to calculate positions
// WHY: Reduces line count and complexity of parseBiomeOutput
// QUOTE(LINT): "Function has too many lines (130). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function calculatePositions(
	diagnostic: BiomeDiagnostic,
	filePath: string,
): {
	line: number;
	column: number;
	endLine: number | undefined;
	endColumn: number | undefined;
} {
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

	return { line, column, endLine, endColumn };
}

// CHANGE: Extracted helper to process single diagnostic
// WHY: Reduces complexity and line count of parseBiomeOutput
// QUOTE(LINT): "Function has too many lines (130). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function processDiagnostic(
	diagnostic: BiomeDiagnostic,
	results: BiomeResult[],
): void {
	// CHANGE: Avoid truthiness fallback for file path
	// WHY: strict-boolean-expressions — check type explicitly
	// REF: REQ-LINT-FIX
	const filePath =
		typeof diagnostic.location?.path?.file === "string"
			? diagnostic.location.path.file
			: "";
	const messageText = parseMessageText(diagnostic);
	const { line, column, endLine, endColumn } = calculatePositions(
		diagnostic,
		filePath,
	);

	const severityNumber = 2;
	const resultMessage = {
		// CHANGE: Avoid truthiness on possibly empty string
		// WHY: strict-boolean-expressions — check string content explicitly
		// REF: REQ-LINT-FIX
		ruleId:
			typeof diagnostic.category === "string" && diagnostic.category.length > 0
				? diagnostic.category
				: null,
		severity: severityNumber,
		message:
			messageText.trim().length > 0 ? messageText.trim() : "Biome diagnostic",
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
	(existingResult.messages as Array<typeof resultMessage>).push(resultMessage);
}

/**
 * Парсит вывод Biome в JSON формате.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 130 lines and complexity 23
 * QUOTE(LINT): "Function has too many lines/complexity"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
 *
 * @param stdout Вывод Biome
 * @returns Массив результатов
 *
 * @pure true
 * @invariant result.length >= 0
 * @complexity O(n) where n = |diagnostics|
 */
export function parseBiomeOutput(stdout: string): ReadonlyArray<BiomeResult> {
	try {
		const biomeOutput = JSON.parse(stdout) as BiomeOutput;
		const results: BiomeResult[] = [];

		if (Array.isArray(biomeOutput.diagnostics)) {
			for (const item of biomeOutput.diagnostics) {
				const diagnostic = item as BiomeDiagnostic;
				processDiagnostic(diagnostic, results);
			}
		}

		return results;
	} catch {
		return [];
	}
}
