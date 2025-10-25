// CHANGE: Extracted duplicate detection from lint.ts
// WHY: SARIF parsing and duplicate display should be separate
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1196-1284, 1815-1893

import type {
	DuplicateInfo,
	SarifLocation,
	SarifReport,
	SarifResult,
} from "../../core/types/index.js";
// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec, fs, path, promisify } from "../utils/node-mods.js";

const execAsync = promisify(exec);

// CHANGE: Ensure reports directories exist
// WHY: Remove duplication and reduce complexity in generateSarifReport
// QUOTE(ТЗ): "Любое решение строится на инвариантах"
// REF: REQ-DUP-SARIF-OUT
function ensureReportsDir(): string {
	const base = "reports";
	const dir = path.join(base, "jscpd");
	if (!fs.existsSync(base)) {
		fs.mkdirSync(base);
	}
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}
	return dir;
}

// CHANGE: Discover SARIF artifact name in a robust way
// WHY: Different reporter versions may produce different filenames
// QUOTE(ТЗ): "Решение должно быть устойчивым к версиям инструмента"
// REF: REQ-DUP-SARIF-OUT
function discoverSarifArtifact(reportsDir: string): string {
	const candidates: ReadonlyArray<string> = [
		path.join(reportsDir, "jscpd-sarif.json"),
		path.join(reportsDir, "jscpd-report.sarif"),
		path.join(reportsDir, "report.sarif"),
	];

	for (const c of candidates) {
		if (fs.existsSync(c)) {
			return c;
		}
	}

	try {
		const files = fs.readdirSync(reportsDir);
		const sarifFile =
			files.find((f) => f.toLowerCase().endsWith(".sarif")) ??
			files.find((f) => f.toLowerCase().endsWith(".json"));
		if (sarifFile !== undefined) {
			return path.join(reportsDir, sarifFile);
		}
	} catch {
		// ignore
	}

	// Default legacy path (may not exist)
	return path.join(reportsDir, "jscpd-sarif.json");
}

/**
 * Генерирует SARIF отчет с помощью jscpd.
 *
 * @returns Путь к сгенерированному SARIF файлу
 */
/**
 * Генерирует SARIF отчет с помощью jscpd для заданного пути.
 *
 * Инварианты:
 * - Выходной каталог reports/jscpd существует после вызова
 * - Используется SARIF-репортер, артефакт сохраняется в reports/jscpd
 * - Не полагаемся на exit code jscpd (при дублях он не ноль)
 *
 * @param targetPath Корневой путь сканирования (из CLI)
 * @returns Абсолютный путь к найденному SARIF файлу
 */
// CHANGE: Add targetPath parameter and force reporters/output
// WHY: jscpd не генерировал SARIF в ожидаемое место; необходимо явно указать репортер и каталог
// QUOTE(ТЗ): "Любое решение строится на инвариантах и проверяемых источниках"
// REF: REQ-DUP-SARIF-OUT
export async function generateSarifReport(targetPath: string): Promise<string> {
	const reportsDir = ensureReportsDir();

	try {
		// Use SARIF reporter and explicit output directory
		await execAsync(
			`npx jscpd --reporters sarif --output ${reportsDir} ${targetPath}`,
		);
	} catch {
		// jscpd exits with non-zero when duplicates are found; ignore to proceed parsing
	}

	return discoverSarifArtifact(reportsDir);
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
	const hasLocations =
		Array.isArray(result.locations) && result.locations.length > 0;
	const hasMessage = typeof result.message?.text === "string";
	// CHANGE: Accept results that have either structured locations or a message
	// WHY: Some SARIF producers may omit message text while providing locations
	// QUOTE(ТЗ): "Решение должно опираться на устойчивые инварианты формата"
	// REF: REQ-DUP-SARIF-OUT
	return hasLocations || hasMessage;
}

/**
 * Попытка извлечь дубликат из структурированных locations SARIF.
 *
 * Предусловие: result.locations имеет минимум 2 элемента с заполненным region.
 */
type RegionInfo = {
	readonly uri: string;
	readonly start: number;
	readonly end: number;
};

// CHANGE: Type guards to reduce per-function complexity
// WHY: Move branching out of extractRegion to satisfy complexity thresholds
// QUOTE(ТЗ): "Исправить все ошибки линтера"
// REF: REQ-LINT-FIX
function isDefined<T>(v: T | undefined | null): v is T {
	return v !== undefined && v !== null;
}
function isNonEmptyString(s: string | undefined): s is string {
	return typeof s === "string" && s.length > 0;
}
function isNum(n: number | undefined): n is number {
	return typeof n === "number";
}

function extractRegion(loc: SarifLocation): RegionInfo | null {
	const physical = loc.physicalLocation;
	if (!isDefined(physical)) {
		return null;
	}

	const uri = physical.artifactLocation?.uri;
	const start = physical.region?.startLine;
	const end = physical.region?.endLine;

	if (!isNonEmptyString(uri) || !isNum(start) || !isNum(end)) {
		return null;
	}

	return { uri, start, end };
}

function toDuplicateFromLocations(result: SarifResult): DuplicateInfo | null {
	if (!Array.isArray(result.locations) || result.locations.length < 2) {
		return null;
	}

	const a = extractRegion(result.locations[0] as SarifLocation);
	const b = extractRegion(result.locations[1] as SarifLocation);
	if (a === null || b === null) {
		return null;
	}

	return {
		fileA: a.uri,
		startA: a.start,
		endA: a.end,
		fileB: b.uri,
		startB: b.start,
		endB: b.end,
	};
}

function extractDuplicatesFromResults(
	results: ReadonlyArray<SarifResult>,
): DuplicateInfo[] {
	const duplicates: DuplicateInfo[] = [];

	for (const result of results) {
		if (!isValidResult(result)) continue;

		// 1) Prefer structured SARIF locations
		const fromLoc = toDuplicateFromLocations(result);
		if (fromLoc !== null) {
			duplicates.push(fromLoc);
			continue;
		}

		// 2) Fallback: parse free-text message if present
		if (result.message?.text) {
			const fallback = parseDuplicateLocation(result.message.text);
			if (fallback) duplicates.push(fallback);
		}
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
/**
 * CHANGE: Очистка артефактов отчета, если дубликаты не найдены
 * WHY: После успешной проверки без дублей не оставлять мусор в reports/
 * QUOTE(ТЗ): "Любое решение строится на инвариантах" — артефакты не нужны при 0 дубликатах
 * REF: REQ-DUP-SARIF-OUT
 *
 * Инварианты:
 * - Не бросает исключения; ошибки удаления игнорируются.
 * - Удаляет файл SARIF; затем директорию reports/jscpd и родительскую reports при пустоте.
 */
/**
 * CHANGE: Вспомогательный безопасный удалитель файла
 * WHY: Снизить цикломатическую сложность cleanupReportsArtifacts до допустимого уровня
 * QUOTE(ТЗ): "Исправить все ошибки линтера"
 * REF: REQ-LINT-FIX (complexity)
 */
function removeFileIfExists(p: string): void {
	try {
		if (fs.existsSync(p)) {
			fs.rmSync(p, { force: true });
		}
	} catch {
		// ignore errors
	}
}

/**
 * CHANGE: Вспомогательный удалитель пустых директорий
 * WHY: Инкапсулировать проверки и удалить дублирующиеся условия
 * REF: REQ-LINT-FIX (complexity)
 */
function removeDirIfEmpty(dir: string): void {
	try {
		if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
			fs.rmdirSync(dir);
		}
	} catch {
		// ignore errors
	}
}

/**
 * CHANGE: Очистка артефактов отчета, если дубликаты не найдены
 * WHY: После успешной проверки без дублей не оставлять мусор в reports/
 * QUOTE(ТЗ): "Любое решение строится на инвариантах" — артефакты не нужны при 0 дубликатах
 * REF: REQ-DUP-SARIF-OUT
 *
 * Инварианты:
 * - Не бросает исключения; ошибки удаления игнорируются.
 * - Удаляет файл SARIF; затем директорию reports/jscpd и родительскую reports при пустоте.
 */
export function cleanupReportsArtifacts(
	sarifPath: string,
	hasDuplicates: boolean,
): void {
	// CHANGE: Не удаляем артефакты, если дубликаты есть — нужны для отладки
	if (hasDuplicates) return;

	removeFileIfExists(sarifPath);

	const artifactDir = path.dirname(sarifPath);
	removeDirIfEmpty(artifactDir);

	const reportsDir = path.dirname(artifactDir);
	removeDirIfEmpty(reportsDir);
}

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
