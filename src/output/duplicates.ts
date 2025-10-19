// CHANGE: Extracted duplicate detection from lint.ts
// WHY: SARIF parsing and duplicate display should be separate
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1196-1284, 1815-1893

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import type { DuplicateInfo, SarifReport } from "../types/index";

const execAsync = promisify(exec);

/**
 * Генерирует SARIF отчет с помощью jscpd.
 *
 * @returns Путь к сгенерированному SARIF файлу
 */
export async function generateSarifReport(): Promise<string> {
	// Generate SARIF report using jscpd
	const reportsDir = "reports/jscpd";
	const sarifPath = path.join(reportsDir, "jscpd-sarif.json");

	// Ensure reports directory exists
	if (!fs.existsSync("reports")) {
		fs.mkdirSync("reports");
	}
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir);
	}

	try {
		await execAsync(`npx jscpd src`);
	} catch {
		// jscpd exits with a non-zero code when duplicates are found; treat as expected
		// SARIF file should still be generated
	}

	return sarifPath;
}

// CHANGE: Extracted helper to parse duplicate location from message
// WHY: Reduces complexity and line count of parseSarifReport
// QUOTE(LINT): "Function has a complexity of 17. Maximum allowed is 8"
// REF: ESLint complexity, max-lines-per-function
// SOURCE: n/a
/**
 * CHANGE: Factor out regex matching and validation to reduce complexity of parseDuplicateLocation
 * WHY: Keep cyclomatic complexity under threshold while preserving invariants
 * QUOTE(ТЗ): "Исправить все ошибки линтера"
 * REF: REQ-LINT-FIX, ESLint complexity
 */
type CloneGroups = {
	fileA: string;
	startLineA: string;
	endLineA: string;
	fileB: string;
	startLineB: string;
	endLineB: string;
};

// CHANGE: Helper to normalize regex group access without using nullish coalescing
// WHY: Reduce cyclomatic complexity in extractCloneGroups; centralize safety checks
// QUOTE(ТЗ): "Исправить все ошибки линтера"
// REF: REQ-LINT-FIX, ESLint complexity
function groupStr(match: RegExpMatchArray, index: number): string {
	const v = match[index];
	return typeof v === "string" ? v : "";
}

function extractCloneGroups(messageText: string): CloneGroups | null {
	// CHANGE: Single source of truth for regex and group extraction
	// WHY: Avoid duplication and lower complexity in the caller
	// REF: REQ-LINT-FIX
	const match = messageText.match(
		/Clone detected in typescript, - (.+?)\[(\d+):(\d+) - (\d+):(\d+)\] and (.+?)\[(\d+):(\d+) - (\d+):(\d+)\]/,
	);
	if (match === null) {
		return null;
	}

	const fileA = groupStr(match, 1);
	const startLineA = groupStr(match, 2);
	const endLineA = groupStr(match, 4);
	const fileB = groupStr(match, 6);
	const startLineB = groupStr(match, 7);
	const endLineB = groupStr(match, 9);

	const fields = [fileA, startLineA, endLineA, fileB, startLineB, endLineB];
	if (fields.some((f) => f.length === 0)) {
		return null;
	}

	return { fileA, startLineA, endLineA, fileB, startLineB, endLineB };
}

// CHANGE: Reduced to a simple transformation using validated groups
// WHY: Lower cyclomatic complexity to satisfy ESLint rule
// REF: REQ-LINT-FIX
function parseDuplicateLocation(messageText: string): DuplicateInfo | null {
	const g = extractCloneGroups(messageText);
	if (g === null) {
		return null;
	}
	return {
		fileA: g.fileA,
		fileB: g.fileB,
		startA: Number.parseInt(g.startLineA, 10),
		endA: Number.parseInt(g.endLineA, 10),
		startB: Number.parseInt(g.startLineB, 10),
		endB: Number.parseInt(g.endLineB, 10),
	};
}

// CHANGE: Extracted helper to load SARIF content
// WHY: Reduces line count of parseSarifReport
// QUOTE(LINT): "Function has too many lines (58). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function loadSarifContent(sarifPath: string): SarifReport | null {
	if (!fs.existsSync(sarifPath)) {
		return null;
	}

	try {
		const sarifContent = fs.readFileSync(sarifPath, "utf8");
		return JSON.parse(sarifContent) as SarifReport;
	} catch {
		return null;
	}
}

function validateSarifStructure(sarif: SarifReport | null): boolean {
	return !!sarif?.runs?.[0]?.results;
}

function isValidResult(result: {
	locations?: ReadonlyArray<{ physicalLocation?: object }>;
	message?: { text: string };
}): boolean {
	return !!(
		result.locations &&
		Array.isArray(result.locations) &&
		result.locations.length > 0 &&
		result.message
	);
}

function extractDuplicatesFromResults(
	results: ReadonlyArray<{
		locations?: ReadonlyArray<{ physicalLocation?: object }>;
		message?: { text: string };
	}>,
): DuplicateInfo[] {
	const duplicates: DuplicateInfo[] = [];

	for (const result of results) {
		if (!isValidResult(result) || !result.message) continue;

		const duplicate = parseDuplicateLocation(result.message.text);
		if (duplicate) duplicates.push(duplicate);
	}

	return duplicates;
}

/**
 * Парсит SARIF отчет и извлекает информацию о дубликатах.
 *
 * CHANGE: Refactored to reduce complexity from 11 to <8
 * WHY: Original function had complexity 11
 * QUOTE(LINT): "Function has a complexity of 11. Maximum allowed is 8"
 * REF: ESLint complexity
 * SOURCE: n/a
 *
 * @param sarifPath Путь к SARIF файлу
 * @returns Массив информации о дубликатах
 */
export function parseSarifReport(
	sarifPath: string,
): ReadonlyArray<DuplicateInfo> {
	try {
		const sarif = loadSarifContent(sarifPath);
		if (!validateSarifStructure(sarif) || !sarif?.runs?.[0]?.results) {
			return [];
		}

		const results = sarif.runs[0].results;
		return extractDuplicatesFromResults(results);
	} catch (error) {
		console.error("Error parsing SARIF report:", error);
		return [];
	}
}

// CHANGE: Extracted helper to display single duplicate
// WHY: Reduces line count of displayClonesFromSarif
// QUOTE(LINT): "Function has too many lines (56). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function displaySingleDuplicate(
	dup: DuplicateInfo,
	dupNum: number,
	width: number,
): void {
	console.log(
		`\n=========================== DUPLICATE #${dupNum} ===========================`,
	);
	console.log(
		`A: ${dup.fileA}:${dup.startA}-${dup.endA}                 │ B: ${dup.fileB}:${dup.startB}-${dup.endB}`,
	);
	console.log(
		"-------------------------------------------┆------------------------------------------",
	);

	try {
		const fileAContent = fs.readFileSync(dup.fileA, "utf8").split("\n");
		const fileBContent = fs.readFileSync(dup.fileB, "utf8").split("\n");

		const linesA = dup.endA - dup.startA + 1;
		const linesB = dup.endB - dup.startB + 1;
		const minLines = Math.min(linesA, linesB);

		const availableWidth = width - 20;
		const halfWidth = Math.floor(availableWidth / 2);

		for (let lineIdx = 0; lineIdx < minLines; lineIdx += 1) {
			const lineNumA = dup.startA + lineIdx;
			const lineNumB = dup.startB + lineIdx;

			// CHANGE: Use nullish coalescing instead of truthiness on strings
			// WHY: strict-boolean-expressions — avoid || fallback on possibly empty string
			// QUOTE(ТЗ): "Исправить все ошибки линтера"
			// REF: REQ-LINT-FIX
			const contentA = fileAContent.at(lineNumA - 1) ?? "";
			const contentB = fileBContent.at(lineNumB - 1) ?? "";

			const truncatedA =
				contentA.length > halfWidth
					? `${contentA.substring(0, halfWidth - 1)}…`
					: contentA;
			const truncatedB =
				contentB.length > halfWidth
					? `${contentB.substring(0, halfWidth - 1)}…`
					: contentB;

			console.log(
				`${lineNumA.toString().padStart(3)} │ ${truncatedA.padEnd(halfWidth)} │ ${lineNumB.toString().padStart(3)} │ ${truncatedB}`,
			);
		}
	} catch {
		console.log(`⚠ cannot read ${dup.fileA} or ${dup.fileB}`);
	}
}

/**
 * Отображает дубликаты кода из SARIF отчета.
 *
 * CHANGE: Refactored to reduce line count
 * WHY: Original function had 56 lines
 * QUOTE(LINT): "Function has too many lines (56). Maximum allowed is 50"
 * REF: ESLint max-lines-per-function
 * SOURCE: n/a
 *
 * @param duplicates Массив информации о дубликатах
 * @param maxClones Максимальное количество дубликатов для отображения
 * @param width Ширина терминала
 */
export function displayClonesFromSarif(
	duplicates: ReadonlyArray<DuplicateInfo>,
	maxClones: number,
	width: number,
): void {
	const limitedDuplicates = duplicates.slice(0, maxClones);

	for (let i = 0; i < limitedDuplicates.length; i += 1) {
		const dup = limitedDuplicates[i];
		// CHANGE: Avoid truthiness check on possibly undefined entry
		// WHY: strict-boolean-expressions — explicit undefined check
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX
		if (dup === undefined) {
			continue;
		}
		displaySingleDuplicate(dup, i + 1, width);
	}

	if (duplicates.length >= maxClones) {
		console.log(
			`\n(Showing first ${maxClones} of ${duplicates.length}+ duplicates found)`,
		);
	}
}
