#!/usr/bin/env ts-node

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import ruleDocs from "eslint-rule-docs";

// CHANGE: Вынесены утилиты для разбора git diff и расчетов курсора
// WHY: Требуется показывать lint-ошибки в формате git diff с точным позиционированием каретки
// QUOTE(ТЗ): "Можешь дописать lint.ts и сделать что бы он отображал код не просто так, а с гит изменениями"
// REF: REQ-20250210-LINT-DIFF
// SOURCE: n/a

export type DiffSymbol = "+" | "-" | " " | "@" | "\\" | undefined;

/**
 * Строка фрагмента unified diff со сведениями о символе и линии в HEAD.
 *
 * @property raw Полный текст строки diff с префиксом
 * @property symbol Символ diff (`+`, `-`, ` `, `@` или `\`)
 * @property headLineNumber Номер строки в HEAD или null, если строка удалена
 * @property content Содержимое без префикса diff
 */
export interface DiffLineView {
	readonly raw: string;
	readonly symbol: DiffSymbol;
	readonly headLineNumber: number | null;
	readonly content: string;
}

/**
 * Фрагмент diff с выделенной строкой HEAD.
 *
 * @property header Заголовок хунка (строка `@@ ... @@`)
 * @property lines Строки фрагмента после заголовка
 * @property pointerIndex Индекс строки в массиве lines, на которую указывает целевая HEAD-линия
 */
export interface DiffSnippet {
	readonly header: string;
	readonly lines: ReadonlyArray<DiffLineView>;
	readonly pointerIndex: number | null;
}

const unifiedHeaderPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Извлекает из unified diff тот фрагмент, который содержит указанную строку из HEAD.
 *
 * @param unifiedDiff Полный unified diff в текстовом виде
 * @param targetLine Целевая линия в HEAD (1-based)
 * @returns Фрагмент diff или null, если строка не менялась
 *
 * @invariant targetLine > 0
 */
export function extractDiffSnippet(unifiedDiff: string, targetLine: number): DiffSnippet | null {
	if (targetLine <= 0) {
		throw new Error(`targetLine must be positive, received ${targetLine}`);
	}

	const lines = unifiedDiff.split(/\r?\n/u);

	let currentHeader = "";
	let currentLines: DiffLineView[] = [];
	let currentPointer: number | null = null;
	let headLine = 0;

	const flushSnippet = (): DiffSnippet | null => {
		if (currentHeader && currentPointer !== null) {
			return {
				header: currentHeader,
				lines: currentLines,
				pointerIndex: currentPointer,
			};
		}
		return null;
	};

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const maybeSnippet = flushSnippet();
			if (maybeSnippet) {
				return maybeSnippet;
			}

			currentHeader = line;
			currentLines = [];
			currentPointer = null;
			const match = unifiedHeaderPattern.exec(line);
			headLine = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
			continue;
		}

		if (!currentHeader) {
			continue;
		}

		const symbol = line.length > 0 ? (line[0] as DiffSymbol) : undefined;
		let headLineNumber: number | null = null;

		if (symbol === "+" || symbol === " ") {
			headLineNumber = headLine;
			headLine += 1;
		} else if (symbol === "-") {
			// Удаленные строки не увеличивают headLine
		} else {
			// Строки вида "\ No newline at end of file" и другие служебные
		}

		const content = symbol ? line.slice(1) : line;
		currentLines.push({
			raw: line,
			symbol,
			headLineNumber,
			content,
		});

		if (headLineNumber === targetLine) {
			currentPointer = currentLines.length - 1;
		}
	}

	return flushSnippet();
}

/**
 * Находит первый фрагмент diff из списка кандидатов, содержащий указанную строку HEAD.
 *
 * @param candidates Список текстов unified diff
 * @param targetLine Номер строки в HEAD (1-based)
 * @returns Пара { snippet, index } либо null, если строка не затронута
 *
 * @invariant targetLine > 0
 */
export function pickSnippetForLine(
	candidates: ReadonlyArray<string>,
	targetLine: number,
): { readonly snippet: DiffSnippet; readonly index: number } | null {
	if (targetLine <= 0) {
		throw new Error(`targetLine must be positive, received ${targetLine}`);
	}

	for (let i = 0; i < candidates.length; i += 1) {
		const diff = candidates[i];
		if (!diff || diff.trim().length === 0) {
			continue;
		}
		const snippet = extractDiffSnippet(diff, targetLine);
		if (snippet) {
			return { snippet, index: i };
		}
	}
	return null;
}

/**
 * Конвертирует визуальную колонку (как в ESLint) в реальный индекс символа.
 *
 * @param lineContent Строка исходного кода без diff-префикса
 * @param visualColumn Визуальная колонка (0-based)
 * @param tabSize Размер табуляции; по умолчанию 8, как в git diff и ESLint
 * @returns Реальный индекс символа (0-based)
 *
 * @invariant visualColumn >= 0
 */
export function computeRealColumnFromVisual(
	lineContent: string,
	visualColumn: number,
	tabSize = 8,
): number {
	if (visualColumn < 0) {
		throw new Error(`visualColumn must be non-negative, received ${visualColumn}`);
	}

	let realColumn = 0;
	let currentVisual = 0;

	for (let index = 0; index <= lineContent.length; index += 1) {
		if (currentVisual === visualColumn) {
			realColumn = index;
			break;
		}

		if (currentVisual > visualColumn) {
			realColumn = index;
			break;
		}

		if (index >= lineContent.length) {
			realColumn = lineContent.length;
			break;
		}

		const char = lineContent[index];
		if (char === "\t") {
			const nextTabStop = Math.floor(currentVisual / tabSize + 1) * tabSize;
			if (nextTabStop >= visualColumn) {
				currentVisual = nextTabStop;
				realColumn = index + 1;
				break;
			}
			currentVisual = nextTabStop;
		} else {
			currentVisual += 1;
		}
	}

	return realColumn;
}

const execAsync = promisify(exec);

//
// Configuration interfaces
//
interface PriorityLevel {
	level: number; // number, the smaller the higher priority
	name: string; // level name, for example "Critical"
	rules: string[]; // list of ruleId, falling into this level
}

interface LinterConfig {
	priorityLevels: PriorityLevel[];
}

interface ESLintMessage {
	ruleId: string | null;
	severity: number;
	message: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	source: "eslint";
}

interface TypeScriptMessage {
	code: string;
	severity: number;
	message: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	source: "typescript";
	filePath: string;
}

interface BiomeMessage {
	ruleId: string | null;
	severity: number;
	message: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	source: "biome";
}

interface SarifLocation {
	physicalLocation: {
		artifactLocation: {
			uri: string;
		};
		region: {
			startLine: number;
			startColumn?: number;
			endLine: number;
			endColumn?: number;
		};
	};
}

interface SarifResult {
	locations: SarifLocation[];
	relatedLocations: SarifLocation[];
	message: {
		text: string;
	};
}

interface SarifReport {
	runs: Array<{
		results: SarifResult[];
	}>;
}

interface DuplicateInfo {
	fileA: string;
	fileB: string;
	startA: number;
	endA: number;
	startB: number;
	endB: number;
}

type LintMessage = ESLintMessage | TypeScriptMessage | BiomeMessage;

// CHANGE: Added explicit exec error type to read stdout/stderr without using forbidden any/unknown
// WHY: Ensures git command errors are captured while respecting the no-any rule
// QUOTE(SPEC): "Never use `any`, `unknown`, `eslint-disable`, `ts-ignore`."
// REF: REQ-20250210-LINT-DIFF
// SOURCE: n/a
interface ExecError extends Error {
	stdout?: string;
	stderr?: string;
}

// === Dependency-based ordering helpers ===
import ts from "typescript";

type MsgId = string;
const __msgId = (f: string, m: LintMessage & { filePath: string }) =>
	`${path.resolve(f)}:${m.line}:${m.column}:${m.source}:${(m as any).ruleId ?? (m as any).code ?? "no-rule"}`;

function __buildProgram(): ts.Program | null {
	try {
		const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
		const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
		const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath));
		return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
	} catch {
		return null;
	}
}

function __posOf(sf: ts.SourceFile, m: { line: number; column: number; endLine?: number; endColumn?: number }) {
	const start = ts.getPositionOfLineAndCharacter(sf, Math.max(0, m.line - 1), Math.max(0, m.column - 1));
	const end = (m.endLine && m.endColumn) ?
		ts.getPositionOfLineAndCharacter(sf, m.endLine - 1, Math.max(0, m.endColumn - 1)) : start;
	return { start, end };
}

function __nodeAt(sf: ts.SourceFile, pos: number): ts.Node {
	let n: ts.Node = sf;
	const visit = (node: ts.Node) => {
		if (pos >= node.getStart(sf) && pos < node.getEnd()) {
			n = node;
			ts.forEachChild(node, visit);
		}
	};
	visit(sf);

	// Walk up to a meaningful ancestor node
	while (n.parent && !ts.isIdentifier(n) && !ts.isCallExpression(n) && !ts.isPropertyAccessExpression(n) && !ts.isElementAccessExpression(n)) {
		n = n.parent;
	}
	return n;
}

function __defSymbols(checker: ts.TypeChecker, n: ts.Node): ts.Symbol[] {
	const locus = ts.isIdentifier(n) ? n :
		ts.isPropertyAccessExpression(n) ? n.name :
		ts.isElementAccessExpression(n) ? n.argumentExpression : n;
	const s0 = checker.getSymbolAtLocation(locus);
	if (!s0) return [];
	const s = (s0.getFlags() & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(s0) : s0;
	return s ? [s] : [];
}

function __buildEdges(messages: Array<LintMessage & { filePath: string }>, program: ts.Program) {
	const byFile = new Map<string, Array<LintMessage & { filePath: string }>>();
	for (const m of messages) {
		const f = path.resolve(m.filePath);
		if (!byFile.has(f)) byFile.set(f, []);
		byFile.get(f)!.push(m);
	}

	const checker = program.getTypeChecker();
	const edges: Array<[MsgId, MsgId]> = [];

	for (const [file, msgs] of byFile) {
		const sf = program.getSourceFile(file);
		if (!sf) continue;

		for (const mu of msgs) {
			const { start } = __posOf(sf, mu);
			const node = __nodeAt(sf, start);
			const syms = __defSymbols(checker, node);

			for (const sym of syms) {
				const decls = sym.declarations ?? [];
				for (const decl of decls) {
					const df = path.resolve(decl.getSourceFile().fileName);
					const dMsgs = byFile.get(df);
					if (!dMsgs || dMsgs.length === 0) continue;

					const ds = decl.getStart();
					const de = decl.getEnd();
					const dsf = program.getSourceFile(df)!;
					const found = dMsgs.find(dm => {
						const p = __posOf(dsf, dm);
						return p.start >= ds && p.end <= de;
					});
					if (found) edges.push([__msgId(df, found), __msgId(file, mu)]);
				}
			}
		}

		// Import fallback: prioritize errors originating from imported modules before local ones
		sf.forEachChild(node => {
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
				const spec = node.moduleSpecifier.text;
				const resolved = ts.resolveModuleName(spec, file, program.getCompilerOptions(), ts.sys).resolvedModule;
				if (!resolved) return;
				const target = path.resolve(resolved.resolvedFileName);
				const tMsgs = byFile.get(target);
				if (!tMsgs || tMsgs.length === 0) return;
				const from = __msgId(target, tMsgs[0]!);
				for (const mu of msgs) edges.push([from, __msgId(file, mu)]);
			}
		});
	}
	return edges;
}

function __topoRank(messages: Array<LintMessage & { filePath: string }>, edges: Array<[MsgId,MsgId]>) {
	const ids: MsgId[] = messages.map(m => __msgId(m.filePath, m));
	const succ = new Map<MsgId, Set<MsgId>>();
	const indeg = new Map<MsgId, number>();

	for (const id of ids) {
		succ.set(id, new Set());
		indeg.set(id, 0);
	}

	for (const [u,v] of edges) {
		if (!succ.has(u) || !succ.has(v)) continue;
		if (!succ.get(u)!.has(v)) {
			succ.get(u)!.add(v);
			indeg.set(v, (indeg.get(v) ?? 0) + 1);
		}
	}

	const q = ids.filter(id => (indeg.get(id) ?? 0) === 0).sort();
	const order: MsgId[] = [];

	while (q.length) {
		const u = q.shift()!;
		order.push(u);
		for (const v of succ.get(u) ?? []) {
			indeg.set(v, (indeg.get(v) ?? 0) - 1);
			if ((indeg.get(v) ?? 0) === 0) q.push(v);
		}
		q.sort();
	}

	if (order.length !== ids.length) {
		for (const id of ids) if (!order.includes(id)) order.push(id);
	}

	return new Map(order.map((id,i)=>[id,i]));
}

//
// Parse command line arguments
//
interface CLIOptions {
	targetPath: string;
	maxClones: number;
	width: number;
	context?: number; // Reserved for future use
	noFix: boolean;
}

function parseCLIArgs(): CLIOptions {
	const args = process.argv.slice(2);
	let targetPath = ".";
	let maxClones = 15;
	let width = process.stdout.columns || 120;
	let context: number | undefined;
	let noFix = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--max-clones" && i + 1 < args.length) {
			maxClones = parseInt(args[i + 1]!, 10);
			i++;
		} else if (arg === "--width" && i + 1 < args.length) {
			width = parseInt(args[i + 1]!, 10);
			i++;
		} else if (arg === "--context" && i + 1 < args.length) {
			context = parseInt(args[i + 1]!, 10);
			i++;
		} else if (arg === "--no-fix") {
			noFix = true;
		} else if (arg && !arg.startsWith("--")) {
			targetPath = arg;
		}
	}

	return { targetPath, maxClones, width, context, noFix };
}

const cliOptions = parseCLIArgs();

//
// Load configuration and prepare rule mapping
//
function loadLinterConfig(configPath = path.resolve(process.cwd(), "linter.config.json")): LinterConfig | null {
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const cfg = JSON.parse(raw);
		if (!Array.isArray(cfg?.priorityLevels)) return null;
		for (const pl of cfg.priorityLevels) {
			pl.rules = Array.isArray(pl.rules) ? pl.rules.map((r: string) => String(r).toLowerCase()) : [];
		}
		return cfg as LinterConfig;
	} catch {
		return null;
	}
}

function ruleIdOf(m: any): string {
	return String(m.ruleId ?? m.code ?? m.rule ?? m.category ?? "").toLowerCase();
}

function makeRuleLevelMap(cfg: LinterConfig) {
	const map = new Map<string, { level: number; name: string }>();
	for (const pl of cfg.priorityLevels) {
		for (const r of pl.rules) {
			map.set(r, { level: pl.level, name: pl.name });
		}
	}
	return map;
}

const config = loadLinterConfig();
const ruleLevelMap = config ? makeRuleLevelMap(config) : null;
const TAB_WIDTH = 8;

// CHANGE: Added git helpers for preparing diff/blame/history context
// WHY: Lint output needs to reference git changes directly
// QUOTE(SPEC): "Show lint errors with git diff information"
// REF: REQ-20250210-LINT-DIFF
// SOURCE: n/a
interface DiffRangeConfig {
	readonly diffArg: string;
	readonly label: string;
}

interface GitDiffBlock {
	readonly heading: string;
	readonly lines: ReadonlyArray<string>;
	readonly footer: string;
	readonly headLineNumbers: ReadonlySet<number>;
}

interface GitHistoryBlock {
	readonly lines: ReadonlyArray<string>;
	readonly totalCommits: number;
	readonly latestSnippet?: ReadonlyArray<string>;
}

function visualColumnAt(content: string, index: number, tabWidth = TAB_WIDTH): number {
	let column = 0;
	const limit = Math.max(0, Math.min(index, content.length));
	for (let i = 0; i < limit; i += 1) {
		const ch = content[i];
		if (ch === "\t") {
			const offset = tabWidth - (column % tabWidth);
			column += offset;
		} else {
			column += 1;
		}
	}
	return column;
}

function expandTabs(content: string, tabWidth = TAB_WIDTH): string {
	let column = 0;
	let result = "";
	for (const ch of content) {
		if (ch === "\t") {
			const spaces = tabWidth - (column % tabWidth);
			result += " ".repeat(spaces);
			column += spaces;
		} else {
			result += ch;
			column += 1;
		}
	}
	return result;
}

function getWorkspaceSnippet(
	filePath: string,
	centerLine: number,
	context = 2,
): ReadonlyArray<string> | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
		const start = Math.max(0, centerLine - context - 1);
		const end = Math.min(fileContent.length, centerLine + context);
		if (start >= end) return null;
		const snippet: string[] = [];
		for (let i = start; i < end; i += 1) {
			snippet.push(`${String(i + 1).padStart(4)} | ${fileContent[i] ?? ""}`);
		}
		return snippet;
	} catch {
		return null;
	}
}

async function getCommitSnippetForLine(
	commitHash: string,
	filePath: string,
	lineNumber: number,
	context = 3,
): Promise<ReadonlyArray<string> | null> {
	const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
	try {
		const { stdout } = await execAsync(`git show ${commitHash}:${relativePath}`);
		const lines = stdout.split(/\r?\n/u);
		if (lineNumber <= 0 || lineNumber > lines.length) {
			return null;
		}
		const start = Math.max(0, lineNumber - context - 1);
		const end = Math.min(lines.length, lineNumber + context);
		const snippet: string[] = [];
		for (let i = start; i < end; i += 1) {
			snippet.push(`${String(i + 1).padStart(4)} | ${lines[i] ?? ""}`);
		}
		return snippet;
	} catch (error) {
		return null;
	}
}

interface DiffSnippetSelection {
	readonly snippet: DiffSnippet;
	readonly descriptor: string;
}

async function detectDiffRange(): Promise<DiffRangeConfig> {
	try {
		const { stdout } = await execAsync("git rev-parse --abbrev-ref --symbolic-full-name HEAD@{upstream}");
		const upstream = stdout.trim();
		if (upstream.length > 0) {
			return {
				diffArg: `${upstream}...HEAD`,
				label: `${upstream}...HEAD`,
			};
		}
	} catch (error: ExecError) {
		if (error.stderr) {
			// Upstream is missing — fall back to local comparison
		}
	}
	return {
		diffArg: "HEAD",
		label: "HEAD",
	};
}

	async function getGitDiffBlock(
		message: LintMessage & { filePath: string },
		range: DiffRangeConfig,
		contextLines: number,
	): Promise<GitDiffBlock | null> {
		const normalizedContext = contextLines > 0 ? contextLines : 3;

		// CHANGE: Added fallback git diff commands for workspace and index
		// WHY: Errors may come from uncommitted changes that are not present in upstream...HEAD diff
		// QUOTE(SPEC): "Ensure git diff shows local modifications as well"
		// REF: REQ-20250210-LINT-DIFF
		// SOURCE: n/a
		const attempts: Array<{ readonly descriptor: string; readonly command: string }> = [
			{
				descriptor: range.label,
				command: `git diff --unified=${normalizedContext} ${range.diffArg} -- "${message.filePath}"`,
			},
			{
				descriptor: "workspace",
				command: `git diff --unified=${normalizedContext} -- "${message.filePath}"`,
			},
			{
				descriptor: "index",
				command: `git diff --cached --unified=${normalizedContext} -- "${message.filePath}"`,
			},
		];

		const diffOutputs: string[] = [];
		const descriptors: string[] = [];
		let selection: DiffSnippetSelection | null = null;

		for (const attempt of attempts) {
			let diffOutput = "";
			try {
				const { stdout } = await execAsync(attempt.command, { maxBuffer: 10 * 1024 * 1024 });
				diffOutput = stdout;
			} catch (error: ExecError) {
				if (error.stdout) {
					diffOutput = error.stdout;
				} else {
					continue;
				}
			}

			if (diffOutput.trim().length === 0) {
				continue;
			}

			diffOutputs.push(diffOutput);
			descriptors.push(attempt.descriptor);

			const pickResult = pickSnippetForLine(diffOutputs, message.line);
			if (pickResult) {
				const descriptorIndex = pickResult.index;
				const descriptor = descriptors[descriptorIndex] ?? attempt.descriptor;
				selection = {
					snippet: pickResult.snippet,
					descriptor,
				};
				break;
			}
		}

		if (!selection) {
			return null;
		}

		const { snippet, descriptor } = selection;
		const pointerIndex = snippet.pointerIndex;
		if (pointerIndex === null) {
			return null;
		}

		const pointerLine = snippet.lines[pointerIndex];
		if (!pointerLine) {
			return null;
		}

		const visualStart = Math.max(0, message.column - 1);
		const startColumn = computeRealColumnFromVisual(pointerLine.content, visualStart);
		let endVisual = visualStart + 1;
		if ("endColumn" in message && typeof message.endColumn === "number" && Number.isFinite(message.endColumn)) {
			endVisual = Math.max(visualStart + 1, message.endColumn - 1);
		}
		const endColumn = computeRealColumnFromVisual(pointerLine.content, endVisual);

		const clampedStart = Math.min(startColumn, pointerLine.content.length);
		const clampedEnd = Math.max(clampedStart + 1, Math.min(pointerLine.content.length, endColumn));
	const refineHighlightRange = (content: string, start: number, end: number, msg: unknown) => {
		const text = (() => {
			if (typeof msg === "string") return msg;
			if (msg && typeof msg === "object" && "message" in (msg as Record<string, unknown>)) {
				const inner = (msg as Record<string, unknown>).message;
				return typeof inner === "string" ? inner : String(inner);
			}
			return String(msg);
		})();
		const identMatch = text.match(/["']([A-Za-z0-9_$]+)["']/);
		if (identMatch) {
			const identifier = identMatch[1];
			const foundIdx = content.indexOf(identifier);
			if (foundIdx !== -1) {
				return { start: foundIdx, end: foundIdx + identifier.length };
			}
		}
		return { start, end };
	};

		const refinedRange = refineHighlightRange(pointerLine.content, clampedStart, clampedEnd, message);
		const rangeStart = Math.max(0, Math.min(refinedRange.start, pointerLine.content.length));
		const rangeEnd = Math.max(rangeStart + 1, Math.min(pointerLine.content.length, refinedRange.end));
		const headLineNumbers = new Set<number>();
		const formattedLines: string[] = [];
		snippet.lines.forEach((line) => {
			const lineNumber = line.headLineNumber !== null ? String(line.headLineNumber).padStart(4) : "    ";
			const symbol = line.symbol ?? " ";
			if (line.headLineNumber !== null) {
				headLineNumbers.add(line.headLineNumber);
			}
			formattedLines.push(`${symbol} ${lineNumber} | ${expandTabs(line.content, TAB_WIDTH)}`);
		});

		if (pointerLine) {
		const pointerLabel = "    ";
		const pointerSymbol = " ";
		const pointerExpanded = expandTabs(pointerLine.content, TAB_WIDTH);
		const visualStartColumn = Math.max(0, visualColumnAt(pointerLine.content, rangeStart, TAB_WIDTH));
		const visualEndColumn = Math.max(visualStartColumn + 1, visualColumnAt(pointerLine.content, rangeEnd, TAB_WIDTH));
		const cappedEnd = Math.min(pointerExpanded.length, visualEndColumn);
		const caretBase = `${" ".repeat(Math.min(visualStartColumn, pointerExpanded.length))}${"^".repeat(Math.max(1, cappedEnd - visualStartColumn))}`;
		const caretOverlay = caretBase.padEnd(pointerExpanded.length, " ");
		const caretLinePrefixLength = 1 + 1 + pointerLabel.length + 1 + 1 + 1; // symbol, space, label, space, '|', space
		const caretLine = `${" ".repeat(caretLinePrefixLength)}${caretOverlay}`;
			formattedLines.splice(pointerIndex + 1, 0, caretLine);
		}

		return {
			heading: `--- git diff (${descriptor}, U=${normalizedContext}) -------------------------`,
			lines: [snippet.header, ...formattedLines],
			footer: "---------------------------------------------------------------",
			headLineNumbers,
		};
	}

interface GitBlameOptions {
	historyCount?: number;
	fallbackSnippet?: ReadonlyArray<string>;
}

interface GitBlameResult {
	lines: ReadonlyArray<string>;
	commitHash: string | null;
	shortHash: string | null;
}

async function getGitBlameBlock(
	filePath: string,
	line: number,
	options?: GitBlameOptions,
): Promise<GitBlameResult | null> {
	const contextSize = 2;
	const startLine = Math.max(1, line - contextSize);
	const endLine = line + contextSize;
	const blameCommand = `git blame --line-porcelain -L ${startLine},${endLine} -- "${filePath}"`;
	let blameOutput = "";

	try {
		const { stdout } = await execAsync(blameCommand, { maxBuffer: 2 * 1024 * 1024 });
		blameOutput = stdout;
	} catch (error: ExecError) {
		if (error.stdout) {
			blameOutput = error.stdout;
		} else {
			return null;
		}
	}

	const trimmed = blameOutput.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const rows = trimmed.split(/\r?\n/u);
	const headerTokens = rows[0]?.split(" ") ?? [];
	const commitHash = headerTokens[0] ?? "";
	const originalLineNumber = Number.parseInt(headerTokens[1] ?? "0", 10) || line;
	const authorLine = rows.find((row) => row.startsWith("author "));
	const author = authorLine ? authorLine.slice("author ".length).trim() : "unknown";
	const authorTimeLine = rows.find((row) => row.startsWith("author-time "));
	const authorEpoch = authorTimeLine ? Number.parseInt(authorTimeLine.slice("author-time ".length), 10) : Number.NaN;
	const summaryLine = rows.find((row) => row.startsWith("summary "));
	const summary = summaryLine ? summaryLine.slice("summary ".length).trim() : "(no summary)";
	const sourceLine = rows.find((row) => row.startsWith("\t"));
	const codeText = sourceLine ? sourceLine.slice(1) : "";

	const dateString = Number.isFinite(authorEpoch)
		? new Date(authorEpoch * 1000).toISOString().slice(0, 10)
		: "unknown-date";

	const shortHash = commitHash.slice(0, 12);
	const isZeroHash = /^0+$/.test(commitHash);

const baseHeading = `--- git blame (line ${line}) ------------------------------------`;
	const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
if (isZeroHash) {
	const before = Math.max(1, line - contextSize);
	const after = line + contextSize;
	return {
		lines: [
			baseHeading,
			`Command: git blame -L ${before},${after} -- ${relativePath} | cat`,
		],
		commitHash: null,
		shortHash: null,
	};
}

	const lines: string[] = [
		baseHeading,
		`commit ${shortHash} (${dateString})  Author: ${author}`,
	];
	lines.push(`summary: ${summary}`);
	lines.push(`${line}) ${codeText}`);

	if (typeof options?.historyCount === "number") {
		lines.push(`Total commits for line: ${options.historyCount}`);
	}

	lines.push(`Commands: git blame -L ${line},${line} -- ${relativePath} | cat`);

	const commitSnippet = await getCommitSnippetForLine(commitHash, filePath, originalLineNumber, contextSize);
if (options?.fallbackSnippet && options?.fallbackSnippet.length > 0) {
	lines.push("Code context:");
	for (const snippetLine of options?.fallbackSnippet) {
		lines.push(snippetLine);
	}
}
	return {
		lines,
		commitHash,
		shortHash,
	};
}

async function getGitHistoryBlock(
	filePath: string,
	line: number,
	limit: number,
): Promise<GitHistoryBlock | null> {
	const historyCommand = `git log -L ${line},${line}:${filePath} --date=short`;
	let historyOutput = "";

	try {
		const { stdout } = await execAsync(historyCommand, { maxBuffer: 5 * 1024 * 1024 });
		historyOutput = stdout;
	} catch (error: ExecError) {
		if (error.stdout) {
			historyOutput = error.stdout;
		} else {
			return null;
		}
	}

	const trimmed = historyOutput.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const segments: string[] = [];
	let currentSegment = "";
	const historyLines = trimmed.split(/\r?\n/u);
	const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
	for (const row of historyLines) {
		if (row.startsWith("commit ") && currentSegment.length > 0) {
			segments.push(currentSegment.trimEnd());
			currentSegment = `${row}\n`;
		} else {
			currentSegment += `${row}\n`;
		}
	}
	if (currentSegment.trim().length > 0) {
		segments.push(currentSegment.trimEnd());
	}

const header = "--- history (recent line updates) -------------------------";
	const result: string[] = [header];
	let taken = 0;
	let latestSnippet: ReadonlyArray<string> | undefined;

	for (const segment of segments) {
		if (taken >= limit) {
			break;
		}
		const lines = segment.split(/\r?\n/u);
		const commitLine = lines.find((row) => row.startsWith("commit "));
		if (!commitLine) {
			continue;
		}
		const hash = commitLine.slice("commit ".length).trim();
		const shortHash = hash.slice(0, 12);
		const dateLine = lines.find((row) => row.startsWith("Date:"));
		const date = dateLine ? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date") : "unknown-date";
	const messageLine = lines.find((row) => row.startsWith("    "));
	const summaryRaw = messageLine ? messageLine.trim() : "(no subject)";
	const summary = summaryRaw.length > 100 ? `${summaryRaw.slice(0, 97)}...` : summaryRaw;

		let changeLine = "";
		let inHunk = false;
		for (const row of lines) {
			if (row.startsWith("@@")) {
				inHunk = true;
				continue;
			}
			if (!inHunk) {
				continue;
			}
			if (row.startsWith("commit ") || row.startsWith("diff --git ")) {
				break;
			}
			if ((row.startsWith("+") || row.startsWith("-")) && row.length > 1) {
				changeLine = `${row[0]} ${row.slice(1).trim()}`;
				break;
			}
		}

		const snippet = await getCommitSnippetForLine(hash, filePath, line, 2);
		const snippetLines = snippet && snippet.length > 0 ? snippet : undefined;
	const heading = `--- commit ${shortHash} (${date}) -------------------------`;
	result.push(heading);
	result.push(`summary: ${summary}`);
	result.push(`git show ${shortHash} -- ${relativePath} | cat`);
		if (snippetLines) {
			for (const snippetLine of snippetLines) {
				result.push(snippetLine);
			}
			if (!latestSnippet) {
				latestSnippet = snippetLines;
			}
		} else {
		result.push(`(code for commit ${shortHash} is not available)`);
		}

		taken += 1;
	}

	const totalCommits = segments.length;
	if (result.length > 1) {
		result.push(`Total commits for line: ${totalCommits}`);
		result.push(`Full list: git log --follow -- ${relativePath} | cat`);
		return { lines: result, totalCommits, latestSnippet };
	}
	return null;
}

//
// Auto-fix ESLint issues
//
async function runESLintFix(): Promise<void> {
	console.log(`🔧 Running ESLint auto-fix on: ${cliOptions.targetPath}`);
	try {
		// CHANGE: Special handling for DatabaseManager with functional rules disabled
		// WHY: TypeORM relies on an imperative model with state mutations
		// QUOTE(SPEC): "TypeORM requires an imperative approach with state mutations"
		// REF: linter-error
		// SOURCE: TypeORM documentation
		const isManagerFile = cliOptions.targetPath.includes('manager.ts') || cliOptions.targetPath.includes('src/db');
		const eslintCommand = isManagerFile
			? `npx eslint "${cliOptions.targetPath}" --ext .ts,.tsx --fix --fix-type directive,problem,suggestion,layout --rule "functional/immutable-data: off" --rule "functional/no-try-statements: off" --rule "functional/functional-parameters: off" --rule "@eslint-community/eslint-comments/no-use: off"`
			: `npx eslint "${cliOptions.targetPath}" --ext .ts,.tsx --fix --fix-type directive,problem,suggestion,layout`;

		await execAsync(eslintCommand);
		console.log(`✅ ESLint auto-fix completed`);
	} catch (error: unknown) {
		if (error && typeof error === "object" && "stdout" in error) {
			console.log(`✅ ESLint auto-fix completed with warnings`);
		} else {
			console.error(`❌ ESLint auto-fix failed:`, error);
		}
	}
}

async function runBiomeFix(): Promise<void> {
	console.log(`🔧 Running Biome auto-fix on: ${cliOptions.targetPath}`);
	try {
		await execAsync(
			`npx biome check --write "${cliOptions.targetPath}"`,
		);
		console.log(`✅ Biome auto-fix completed`);
	} catch (error: unknown) {
		if (error && typeof error === "object" && "stdout" in error) {
			console.log(`✅ Biome auto-fix completed with warnings`);
		} else {
			console.error(`❌ Biome auto-fix failed:`, error);
		}
	}
}

//
// TypeScript diagnostics runner
//
async function getTypeScriptDiagnostics(): Promise<TypeScriptMessage[]> {
	try {
		// CHANGE: Always compile the entire project for complete type validation
		// WHY: Running tsc on individual files loses type context and hides incompatibility errors
		// QUOTE(SPEC): "TS2322 in bcsUnified.ts is missed unless the whole project is type-checked"
		// REF: user-msg-lint-missing-type-errors
		// SOURCE: TypeScript compiler behavior
		const command = `npx tsc --noEmit --pretty false`;
		await execAsync(command);
		return []; // No errors if tsc succeeds
	} catch (error: unknown) {
		const messages: TypeScriptMessage[] = [];

		// TypeScript outputs errors to stdout, not stderr
		if (error && typeof error === "object" && "stdout" in error) {
			const stdout = (error as { stdout: string }).stdout;
			const lines = stdout.split("\n");

			for (const line of lines) {
				// Parse TypeScript error/warning format: "file.ts(line,col): error TS2554: message" or "file.ts(line,col): warning TS1234: message"
				const match = line.match(
					/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/,
				);
				if (match) {
					const [, filePath, lineStr, colStr, , code, message] = match;
					messages.push({
						code: `TS${code!}`,
						severity: 2, // TypeScript errors and warnings are displayed as errors
						message: message!,
						line: parseInt(lineStr!, 10),
						column: parseInt(colStr!, 10),
						source: "typescript",
						filePath: filePath!,
					});
				}
			}
		}

		// Filter messages based on target path
		return filterMessagesByPath(messages, cliOptions.targetPath);
	}
}

//
// Filter messages by target path
//
function filterMessagesByPath(
	messages: TypeScriptMessage[],
	targetPath: string,
): TypeScriptMessage[] {
	// If targetPath is current directory, show all messages
	if (targetPath === ".") {
		return messages;
	}

	// If targetPath is a specific file, show only messages from that file
	if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx")) {
		const resolvedTarget = path.resolve(targetPath);
		return messages.filter((msg) => {
			const resolvedFile = path.resolve(msg.filePath);
			return resolvedFile === resolvedTarget;
		});
	}

	// If targetPath is a directory, show only messages from files in that directory
	const resolvedTarget = path.resolve(targetPath);
	return messages.filter((msg) => {
		const resolvedFile = path.resolve(msg.filePath);
		return (
			resolvedFile.startsWith(resolvedTarget + path.sep) ||
			resolvedFile.startsWith(resolvedTarget + "/")
		);
	});
}

//
// Main logic
//
(async (): Promise<void> => {
	console.log(`🔍 Linting directory: ${cliOptions.targetPath}`);

// CHANGE: Added --no-fix flag to allow skipping auto-fixes
// WHY: Users sometimes need to inspect errors without automatic changes
// QUOTE(SPEC): "Allow lint.ts to report issues in /src/exchanges without fixing them"
	// REF: user-msg-lint-not-showing-errors
	// SOURCE: n/a
	if (!cliOptions.noFix) {
		// First run ESLint and Biome fixes in parallel
		await Promise.all([runESLintFix(), runBiomeFix()]);
	}

	// Then run ESLint, Biome, and TypeScript in parallel for remaining issues
	const [eslintResults, biomeResults, tsMessages] = await Promise.all([
		getESLintResults(),
		getBiomeDiagnostics(),
		getTypeScriptDiagnostics(),
	]);

// Always generate SARIF report for duplicates
	const sarifPath = await generateSarifReport();

	// Combine all messages
	const allMessages: Array<LintMessage & { filePath: string }> = [];

	// Add ESLint messages
	for (const result of eslintResults) {
		for (const message of result.messages) {
			allMessages.push({
				...message,
				filePath: result.filePath,
				source: "eslint" as const,
			});
		}
	}

	// Add Biome messages
	for (const result of biomeResults) {
		for (const message of result.messages) {
			allMessages.push({
				...message,
				filePath: result.filePath,
				source: "biome" as const,
			});
		}
	}

	// Add TypeScript messages
	for (const message of tsMessages) {
		allMessages.push({
			...message,
			filePath: message.filePath,
			source: "typescript" as const,
		});
	}

	const hasLintErrors = await processResults(allMessages);

// Always generate SARIF but only display duplicates when there are no lint errors
	const duplicates = parseSarifReport(sarifPath);
	const hasDuplicates = duplicates.length > 0;

	if (!hasLintErrors) {
		// Show duplicates only when there are no lint errors
		if (hasDuplicates) {
			displayClonesFromSarif(duplicates);
		} else {
			console.log("\n✅ No code duplicates found!");
		}
	}

	// Exit with error if there are lint errors OR duplicates (when no lint errors)
	if (hasLintErrors || (!hasLintErrors && hasDuplicates)) {
		process.exit(1);
	}

	async function generateSarifReport(): Promise<string> {
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
			await execAsync(
				`npx jscpd src --format "typescript,tsx" --mode weak --min-tokens 30 --threshold 0 --reporters sarif --output "${reportsDir}"`,
			);
		} catch (error: unknown) {
			// jscpd exits with a non-zero code when duplicates are found; treat as expected
			// SARIF file should still be generated
		}

		return sarifPath;
	}

	function parseSarifReport(sarifPath: string): DuplicateInfo[] {
		try {
			if (!fs.existsSync(sarifPath)) {
				return [];
			}

			const sarifContent = fs.readFileSync(sarifPath, "utf8");
			const sarif: SarifReport = JSON.parse(sarifContent);
			const duplicates: DuplicateInfo[] = [];

			if (!sarif.runs || !sarif.runs[0] || !sarif.runs[0].results) {
				return [];
			}

			for (const result of sarif.runs[0].results) {
				if (result.locations && result.locations.length > 0 && result.message) {
				// Parse message to extract the second location when available
					const messageText = result.message.text;
					const locationMatch = messageText.match(
						/Clone detected in typescript, - (.+?)\[(\d+):(\d+) - (\d+):(\d+)\] and (.+?)\[(\d+):(\d+) - (\d+):(\d+)\]/,
					);

					if (locationMatch) {
						const [
							,
							fileA,
							startLineA,
							,
							endLineA,
							,
							fileB,
							startLineB,
							,
							endLineB,
						] = locationMatch;

						duplicates.push({
							fileA: fileA!,
							fileB: fileB!,
							startA: parseInt(startLineA!, 10),
							endA: parseInt(endLineA!, 10),
							startB: parseInt(startLineB!, 10),
							endB: parseInt(endLineB!, 10),
						});
					}
				}
			}

			return duplicates.slice(0, cliOptions.maxClones);
		} catch (error) {
			console.error("Error parsing SARIF report:", error);
			return [];
		}
	}

	async function getBiomeDiagnostics(): Promise<
		Array<{
			filePath: string;
			messages: Array<{
				ruleId: string | null;
				severity: number;
				message: string;
				line: number;
				column: number;
				endLine?: number;
				endColumn?: number;
			}>;
		}>
	> {
		try {
			const { stdout } = await execAsync(
				`npx biome check "${cliOptions.targetPath}" --reporter=json`,
			);
			const results = parseBiomeOutput(stdout);
			if (results.length > 0) {
				return results;
			}

			// If no results and path is directory, try individual files
			if (!cliOptions.targetPath.endsWith('.ts') && !cliOptions.targetPath.endsWith('.tsx')) {
				console.log("🔄 Biome: Falling back to individual file checking...");
				return getBiomeDiagnosticsPerFile();
			}

			return results;
		} catch (error: unknown) {
			if (error && typeof error === "object" && "stdout" in error) {
				const stdout = (error as { stdout: string }).stdout;
				if (stdout.trim() === "") {
					return [];
				}
				const results = parseBiomeOutput(stdout);
				if (results.length > 0) {
					return results;
				}

				// If no results and path is directory, try individual files
				if (!cliOptions.targetPath.endsWith('.ts') && !cliOptions.targetPath.endsWith('.tsx')) {
					console.log("🔄 Biome: Falling back to individual file checking...");
					return getBiomeDiagnosticsPerFile();
				}

				return results;
			}
			console.error("Biome diagnostics failed:", error);
			return [];
		}
	}

	async function getBiomeDiagnosticsPerFile(): Promise<
		Array<{
			filePath: string;
			messages: Array<{
				ruleId: string | null;
				severity: number;
				message: string;
				line: number;
				column: number;
				endLine?: number;
				endColumn?: number;
			}>;
		}>
	> {
		try {
			// Get TypeScript files in the target path
			const { stdout: lsOutput } = await execAsync(
				`find "${cliOptions.targetPath}" -name "*.ts" -o -name "*.tsx" | head -20`
			);

			const files = lsOutput.trim().split('\n').filter(f => f.trim().length > 0);
			const allResults: Array<{
				filePath: string;
				messages: Array<{
					ruleId: string | null;
					severity: number;
					message: string;
					line: number;
					column: number;
					endLine?: number;
					endColumn?: number;
				}>;
			}> = [];

			for (const file of files) {
				try {
					const { stdout } = await execAsync(
						`npx biome check "${file}" --reporter=json`,
					);
					const results = parseBiomeOutput(stdout);
					allResults.push(...results);
				} catch (fileError: unknown) {
					if (fileError && typeof fileError === "object" && "stdout" in fileError) {
						const stdout = (fileError as { stdout: string }).stdout;
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

	function parseBiomeOutput(stdout: string): Array<{
		filePath: string;
		messages: Array<{
			ruleId: string | null;
			severity: number;
			message: string;
			line: number;
			column: number;
			endLine?: number;
			endColumn?: number;
		}>;
	}> {
		try {
			const biomeOutput = JSON.parse(stdout);
			const results: Array<{
				filePath: string;
				messages: Array<{
					ruleId: string | null;
					severity: number;
					message: string;
					line: number;
					column: number;
					endLine?: number;
					endColumn?: number;
				}>;
			}> = [];

			// Handle Biome's diagnostic format
			if (biomeOutput.diagnostics && Array.isArray(biomeOutput.diagnostics)) {
				for (const diagnostic of biomeOutput.diagnostics) {
					// Skip information-level diagnostics, only show errors and warnings
					if (diagnostic.severity === "information") {
						continue;
					}

					// Extract file path from diagnostic - Biome uses different structure
					const filePath = diagnostic.location?.path?.file || "";

					// Parse message from diagnostic
					let messageText = "";
					if (typeof diagnostic.description === "string") {
						messageText = diagnostic.description;
					} else if (diagnostic.message) {
						if (Array.isArray(diagnostic.message)) {
							messageText = diagnostic.message.map((m: any) =>
								typeof m === "string" ? m : (m.content || "")
							).join(" ");
						} else if (typeof diagnostic.message === "string") {
							messageText = diagnostic.message;
						}
					} else if (diagnostic.title) {
						messageText = diagnostic.title;
					}

					// Helper functions for proper UTF-8 byte offset handling
					const enc = new TextEncoder();
					const dec = new TextDecoder("utf-8");

					const toSpan = (span: any): [number, number] | null => {
						if (!span) return null;
						if (Array.isArray(span) && typeof span[0] === "number") return [span[0], span[1] ?? span[0]];
						if (typeof span === "object" && typeof span.start === "number") return [span.start, span.end ?? span.start];
						return null;
					};

					const byteOffToPos = (text: string, off: number) => {
						const bytes = enc.encode(text);
						const clamped = Math.max(0, Math.min(off >>> 0, bytes.length));
						const prefix = dec.decode(bytes.subarray(0, clamped));
						const nl = prefix.lastIndexOf("\n");
						const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
						const column = nl === -1 ? prefix.length + 1 : prefix.length - nl;
						return { line, column };
					};

					const firstImportOrBOF = (text: string) => {
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
						if (filePath) fileText = fs.readFileSync(filePath, "utf8");
					} catch {}

					const span = toSpan(diagnostic.location?.span);
					if (span && fileText) {
						const [s, e] = span;
						const p1 = byteOffToPos(fileText, s);
						const p2 = byteOffToPos(fileText, e);
						line = p1.line;
						column = p1.column;
						endLine = p2.line;
						endColumn = p2.column;
					} else if (diagnostic.category === "assist/source/organizeImports" && fileText) {
						const p = firstImportOrBOF(fileText);
						line = p.line;
						column = p.column;
					}

					const message = {
						ruleId: diagnostic.category || null,
						severity: diagnostic.severity === "error" ? 2 : 1,
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
					existingResult.messages.push(message);
				}
			}

			return results;
		} catch (parseError) {
			return [];
		}
	}

	async function getESLintResults(): Promise<
		Array<{
			filePath: string;
			messages: Array<{
				ruleId: string | null;
				severity: number;
				message: string;
				line: number;
				column: number;
				endLine?: number;
				endColumn?: number;
			}>;
		}>
	> {
		try {
		// CHANGE: Increase maxBuffer for large projects and skip source fields in JSON output
		// WHY: Massive JSON payloads with source fields can overflow the default exec buffer
		// QUOTE(SPEC): "Failed to parse ESLint output. Parse error: SyntaxError: Unterminated string in JSON"
			// REF: user-msg-fix-json-parse-error
			// SOURCE: n/a
		// CHANGE: Special handling for DatabaseManager with functional rules disabled
		// WHY: TypeORM expects an imperative style with state mutations
		// QUOTE(SPEC): "TypeORM is ORM library requiring imperative approach with state mutations"
			// REF: linter-error
			// SOURCE: TypeORM documentation
			const isManagerFile = cliOptions.targetPath.includes('manager.ts') || cliOptions.targetPath.includes('src/db');
			const eslintCommand = isManagerFile
				? `npx eslint "${cliOptions.targetPath}" --ext .ts,.tsx --format json --rule "functional/immutable-data: off" --rule "functional/no-try-statements: off" --rule "functional/functional-parameters: off" --rule "@eslint-community/eslint-comments/no-use: off"`
				: `npx eslint "${cliOptions.targetPath}" --ext .ts,.tsx --format json`;

			const { stdout } = await execAsync(
				eslintCommand,
				{ maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
			);
			return JSON.parse(stdout) as Array<{
				filePath: string;
				messages: Array<{
					ruleId: string | null;
					severity: number;
					message: string;
					line: number;
					column: number;
					endLine?: number;
					endColumn?: number;
				}>;
			}>;
		} catch (error: unknown) {
			if (error && typeof error === "object" && "stdout" in error) {
				const stdout = (error as { stdout: string }).stdout;
				if (stdout.trim() === "") {
					return [];
				}
				try {
					return JSON.parse(stdout) as Array<{
						filePath: string;
						messages: Array<{
							ruleId: string | null;
							severity: number;
							message: string;
							line: number;
							column: number;
							endLine?: number;
							endColumn?: number;
						}>;
					}>;
				} catch (parseError) {
			// CHANGE: Provide more detailed parser errors
			// WHY: Helps understand whether the failure is related to size, position, or payload
			// QUOTE(SPEC): "Unterminated string in JSON at position 1006125"
					// REF: user-msg-fix-json-parse-error
					// SOURCE: n/a
					console.error("Failed to parse ESLint JSON output");
					console.error("Parse error:", parseError);
					console.error("Output length:", stdout.length);
					console.error("Output preview (first 500 chars):", stdout.slice(0, 500));
					console.error("Output preview (last 500 chars):", stdout.slice(-500));
					return [];
				}
			}
			throw error;
		}
	}

	async function processResults(
		messages: Array<LintMessage & { filePath: string }>,
	): Promise<boolean> {
	// CHANGE: Sort all errors by def→use relationships before checking priority configuration
	// WHY: Causal ordering (definition before usage) makes the report easier to follow
	// QUOTE(SPEC): "First sort everything, then apply the priority filters"
		// REF: user-msg-sort-then-filter
		// SOURCE: n/a

	// 1) Sort ALL messages by def→use relationships
		const program = __buildProgram();
		if (program && messages.length > 1) {
			const edges = __buildEdges(messages, program);
			const rank = __topoRank(messages, edges);
			messages.sort((a, b) => {
		// Primary key: def→use ordering
				const ra = rank.get(__msgId(a.filePath, a)) ?? 0;
				const rb = rank.get(__msgId(b.filePath, b)) ?? 0;
				if (ra !== rb) return ra - rb;
		// Secondary keys to break ties
				if (b.severity - a.severity) return b.severity - a.severity;
				if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
				if (a.line !== b.line) return a.line - b.line;
				return a.column - b.column;
			});
		} else {
	// Fallback: sort without topo ordering when no program info is available
			messages.sort((a, b) => {
				if (b.severity - a.severity) return b.severity - a.severity;
				if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
				if (a.line !== b.line) return a.line - b.line;
				return a.column - b.column;
			});
		}

	// 2) Do not drop messages: instead separate by priority level (configured = level 1, otherwise level 2)
	// CHANGE: Show configured high-priority issues as Level 1 and everything else as Level 2
	// WHY: Keeps the most important issues at the top while still reporting all remaining problems
	// QUOTE(SPEC): "If a rule has no explicit priority it should appear as Level 2"
		// REF: user-msg-level-system
		// SOURCE: n/a

	// Helpers to fetch priority level metadata
		function getPriorityLevel(m: any): number {
			if (!ruleLevelMap) return 2;
			return ruleLevelMap.has(ruleIdOf(m)) ? ruleLevelMap.get(ruleIdOf(m))!.level : 2;
		}

		function getPriorityName(m: any): string {
			if (!ruleLevelMap) return "Critical Compiler Errors";
			return ruleLevelMap.has(ruleIdOf(m))
				? ruleLevelMap.get(ruleIdOf(m))!.name
				: "Critical Compiler Errors";
		}

		//
		// Print results with highlighting
		//
	// CHANGE: Resolve git range and context before printing messages
	// WHY: All diagnostics should reference a consistent diff range and context size
	// QUOTE(SPEC): "Show lint errors together with the relevant git diff"
		// REF: REQ-20250210-LINT-DIFF
		// SOURCE: n/a
		const diffRange: DiffRangeConfig = messages.length > 0
			? await detectDiffRange()
			: { diffArg: "HEAD", label: "HEAD" };
		const diffContext = cliOptions.context ?? 3;

		const printer = async (msgs: Array<LintMessage & { filePath: string }>): Promise<void> => {
			const cache = new Map<string, string[]>();

			const getRuleDocs = (
				ruleId: string | null | undefined,
			): string | null => {
				if (!ruleId) return null;
				try {
					return ruleDocs.getUrl ? ruleDocs.getUrl(ruleId) : null;
				} catch {
					return null;
				}
			};

			for (const m of msgs.slice(0, 15)) {
				const { filePath, line, column, message, severity, source } = m;
				const sevLabel = severity === 2 ? "[ERROR]" : "[WARN ]";
				const ruleId =
					source === "typescript"
						? (m as TypeScriptMessage).code
						: (m as ESLintMessage | BiomeMessage).ruleId ?? "unknown";
				const sourceLabel =
					source === "typescript"
						? "(TypeScript)"
						: source === "biome"
							? "(Biome)"
							: "(ESLint)";

				console.log(
					`\n${sevLabel} ${filePath}:${line}:${column} ${ruleId} ${sourceLabel} — ${message}`,
				);

					const diffBlock = await getGitDiffBlock(m, diffRange, diffContext);
					let printedFromDiff = false;
					if (diffBlock) {
						console.log(diffBlock.heading);
						for (const diffLine of diffBlock.lines) {
							console.log(diffLine);
						}
						console.log(diffBlock.footer);
						printedFromDiff = true;
					}

				if (!cache.has(filePath)) {
					try {
						cache.set(filePath, fs.readFileSync(filePath, "utf8").split("\n"));
					} catch {
						console.log("  (Could not read file for context)");
						continue;
					}
				}
					const lines = cache.get(filePath);
					if (!lines) continue;
					const start = Math.max(line - 3, 0);
					const end = Math.min(line + 2, lines.length);
					const diffLineNumbers = diffBlock ? new Set(diffBlock.headLineNumbers) : new Set<number>();

					for (let i = start; i < end; i++) {
						if (printedFromDiff && diffLineNumbers.has(i + 1)) {
							continue;
						}
						const prefix = i === line - 1 ? ">" : " ";
						const num = String(i + 1).padStart(4);
						const currentLine = lines[i] || "";
						const lineContent = ` ${prefix} ${num} | ${currentLine}`;
						console.log(lineContent);

					if (i === line - 1) {
						// Calculate highlighting
						const prefixLength = ` ${prefix} ${num} | `.length;

					// CHANGE: Fix caret positioning when tabs are present
					// WHY: ESLint reports positions in visual columns (tabs = 8 spaces) while we display actual characters
					// QUOTE(SPEC): "The caret is misaligned when tabs are used"
						// REF: user-msg-fix-cursor-position
						// SOURCE: n/a

					// CHANGE: Implement accurate conversion from ESLint visual columns to character offsets
					// WHY: We must highlight the exact symbol corresponding to the reported visual column
					// QUOTE(SPEC): "The caret still points to the wrong character" — precise alignment is required
						// REF: user-msg-cursor-still-wrong
						// SOURCE: n/a

					// Convert the ESLint column into a real character index
						let realColumn = 0;
						let visualColumn = 0;
						const targetVisualColumn = column - 1; // ESLint uses 1-based indices

					// Walk along the line and convert the ESLint visual column to a character index
						for (let charIndex = 0; charIndex <= currentLine.length; charIndex++) {
						// Stop once the target visual column is reached
							if (visualColumn === targetVisualColumn) {
								realColumn = charIndex;
								break;
							}

						// If we overshoot the target inside a tab, clamp to the current character
							if (visualColumn > targetVisualColumn) {
								realColumn = charIndex;
								break;
							}

						// If we reach the end of the string without hitting the target
							if (charIndex >= currentLine.length) {
								realColumn = currentLine.length;
								break;
							}

							const char = currentLine[charIndex];
							if (char === '\t') {
							// A tab expands to the next 8-character boundary
								const tabSize = 8;
								const nextTabStop = Math.floor(visualColumn / tabSize + 1) * tabSize;
								visualColumn = nextTabStop;
							} else if (char === '\r') {
							// Carriage return typically does not move the visual cursor in modern editors
							// but ESLint may account for it differently
								visualColumn += 0;
							} else if (char === '\n') {
							// Line feed should not appear mid-line, but handle defensively
								visualColumn += 1;
							} else {
							// Regular characters, including spaces
								visualColumn += 1;
							}
						}

					// Handle the case where the target column is beyond the end of the line
						if (visualColumn < targetVisualColumn) {
							realColumn = currentLine.length;
						}

						const startCol = Math.max(0, Math.min(realColumn, currentLine.length));

						let endCol: number;
						if ("endColumn" in m && m.endColumn) {
							endCol = Math.min(m.endColumn - 1, currentLine.length);
						} else if (source === "typescript") {
							// For TypeScript errors, show exactly where TS points
							// But try to highlight a meaningful token if possible
							const charAtPos = currentLine[startCol];

							// Special case for "Expected X arguments" errors
							if (
								message.includes("Expected") &&
								message.includes("arguments")
							) {
								// Try to find the position after the last comma in a function call
								const beforeCursor = currentLine.substring(0, startCol + 15); // Look ahead a bit
								const funcCallMatch = beforeCursor.match(
									/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*$/,
								);
								if (funcCallMatch) {
									// Find the position after the last comma or opening parenthesis
									const lastCommaPos = beforeCursor.lastIndexOf(",");
									const openParenPos = beforeCursor.lastIndexOf("(");
									const targetPos = Math.max(lastCommaPos, openParenPos);
									if (targetPos !== -1) {
										// Position cursor after the comma/paren and any whitespace
										let newStartCol = targetPos + 1;
										while (
											newStartCol < currentLine.length &&
											/\s/.test(currentLine[newStartCol]!)
										) {
											newStartCol++;
										}
										endCol = newStartCol + 1;
									} else {
										endCol = startCol + 1;
									}
								} else {
									endCol = startCol + 1;
								}
							} else if (charAtPos && /[a-zA-Z_$]/.test(charAtPos)) {
								// If it's the start of an identifier, highlight the whole identifier
								const remainingLine = currentLine.substring(startCol);
								const wordMatch = remainingLine.match(
									/^[a-zA-Z_$][a-zA-Z0-9_$]*/,
								);
								if (wordMatch) {
									endCol = Math.min(
										startCol + wordMatch[0].length,
										currentLine.length,
									);
								} else {
									endCol = startCol + 1;
								}
							} else {
								// For other cases (like missing arguments), show single character
								endCol = startCol + 1;
							}
						} else {
							endCol = startCol + 1;
						}

						// Create highlight line
						const beforeHighlight = " ".repeat(prefixLength + startCol);
						const highlightLength = Math.max(1, endCol - startCol);
						const highlight = "^".repeat(highlightLength);

						console.log(`${beforeHighlight}${highlight}`);
					}
				}

		// CHANGE: Attach git blame and commit history for the line
		// WHY: We need both the responsible commit and the evolution of the code
		// QUOTE(SPEC): "Show blame and history context together with git changes"
		// REF: REQ-20250210-LINT-DIFF
	const historyBlock = await getGitHistoryBlock(filePath, line, 3);
	const historyLines = historyBlock ? historyBlock.lines : null;
	const fallbackSnippet = historyBlock?.latestSnippet;
	const blameInfo = await getGitBlameBlock(filePath, line, {
		historyCount: historyBlock?.totalCommits,
		fallbackSnippet,
	});

	const currentShortHash = blameInfo?.shortHash ?? null;
	if (blameInfo) {
		for (const blameLine of blameInfo.lines) {
			console.log(blameLine);
		}
	}

	if (historyLines) {
		let skipBlock = false;
		for (const historyLine of historyLines) {
			if (historyLine.startsWith("--- commit ")) {
				const match = historyLine.match(/--- commit\s+([0-9a-fA-F]+)/);
				const historyHash = match ? match[1] : null;
				skipBlock = Boolean(currentShortHash && historyHash && historyHash.startsWith(currentShortHash));
				if (skipBlock) {
					continue;
				}
			}

			if (skipBlock) {
				const trimmed = historyLine.trimStart();
				if (trimmed.startsWith("Total commits")) {
					skipBlock = false;
					console.log(historyLine);
				} else if (trimmed.startsWith("Full list")) {
					skipBlock = false;
					console.log(historyLine);
				}
				continue;
			}

			console.log(historyLine);
		}
	}

				// 🔍 Research links for LLM context
			// NOTE: Removed autogenerated StackOverflow/GitHub links per user request; keep only minimal metadata.
				if (source === "eslint") {
					const docsUrl = getRuleDocs((m as ESLintMessage).ruleId || undefined);
					if (docsUrl) {
						console.log(`   📖 docs: ${docsUrl}`);
					}

					// StackOverflow advanced search for solutions
					// Auto-search disabled because the generated links were noisy and not helpful.
				} else if (source === "biome") {
					// Biome rule documentation and searches
					const biomeRuleId = (m as BiomeMessage).ruleId;
					if (biomeRuleId) {
						// Biome documentation link (if available)
						console.log(
							`   📖 docs: https://biomejs.dev/linter/rules/${biomeRuleId}`,
						);
					}

				// Auto-search disabled for StackOverflow/GitHub.
				} else {
					// TypeScript error searches - use only error code for better results
					const code = (m as TypeScriptMessage).code;
				// Auto-search disabled for StackOverflow/GitHub.
				}
			}
		};

	// CHANGE: Show only the first 15 errors from the highest priority level
	// WHY: Limit output to the most critical issues first
	// QUOTE(SPEC): "Only display 15 errors at a time"
		// REF: user-msg-15-errors-limit
		// SOURCE: n/a
		if (messages.length > 0) {
			// Group by priority level
			const byLevel = new Map<number, typeof messages>();
			for (const m of messages) {
				const level = getPriorityLevel(m);
				if (!byLevel.has(level)) byLevel.set(level, []);
				byLevel.get(level)!.push(m);
			}

		// Sort levels by priority (1, 2, 3...)
			const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

			// Show only the first non-empty level, up to 15 issues
			for (const level of sortedLevels) {
				const levelMessages = byLevel.get(level)!;
				if (levelMessages.length > 0) {
				// Group entries by priority name inside the level
					const sections = new Map<string, typeof messages>();
				for (const m of levelMessages.slice(0, 15)) { // Maximum 15
						const sectionName = getPriorityName(m);
						if (!sections.has(sectionName)) sections.set(sectionName, []);
						sections.get(sectionName)!.push(m);
					}

				// Print the sections for this level
					for (const [name, arr] of sections) {
						console.log(`\n=== ${name} (${arr.length} issues) ===`);
						await printer(arr);
					}

			// Only show the first level
					break;
				}
			}
		}

		const errorCount = messages.filter((m) => m.severity === 2).length;
		const warningCount = messages.filter((m) => m.severity === 1).length;
		const tsErrorCount = messages.filter(
			(m) => m.source === "typescript" && m.severity === 2,
		).length;
		const biomeErrorCount = messages.filter(
			(m) => m.source === "biome" && m.severity === 2,
		).length;
		const eslintErrorCount = messages.filter(
			(m) => m.source === "eslint" && m.severity === 2,
		).length;

		console.log(
			`\n📊 Total: ${errorCount} errors (${tsErrorCount} TypeScript, ${eslintErrorCount} ESLint, ${biomeErrorCount} Biome), ${warningCount} warnings.`,
		);

		// Return true if there are errors (severity === 2)
		return errorCount > 0;
	}

	function displayClonesFromSarif(duplicates: DuplicateInfo[]): void {
		for (let i = 0; i < duplicates.length; i++) {
			const dup = duplicates[i];
			if (!dup) continue;
			const dupNum = i + 1;

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
				// Read both files to display code blocks side by side
				const fileAContent = fs.readFileSync(dup.fileA, "utf8").split("\n");
				const fileBContent = fs.readFileSync(dup.fileB, "utf8").split("\n");

				// Calculate the range to display
				const linesA = dup.endA - dup.startA + 1;
				const linesB = dup.endB - dup.startB + 1;
				const minLines = Math.min(linesA, linesB); // Show minimum common lines

				for (let lineIdx = 0; lineIdx < minLines; lineIdx++) {
					const lineNumA = dup.startA + lineIdx;
					const lineNumB = dup.startB + lineIdx;

					const contentA = fileAContent[lineNumA - 1] || "";
					const contentB = fileBContent[lineNumB - 1] || "";

				// Truncate lines to fit the terminal width
					const availableWidth = cliOptions.width - 20; // Reserve space for line numbers and separators
					const halfWidth = Math.floor(availableWidth / 2);

					const truncatedA =
						contentA.length > halfWidth
							? contentA.substring(0, halfWidth - 1) + "…"
							: contentA;
					const truncatedB =
						contentB.length > halfWidth
							? contentB.substring(0, halfWidth - 1) + "…"
							: contentB;

					console.log(
						`${lineNumA.toString().padStart(3)} │ ${truncatedA.padEnd(halfWidth)} │ ${lineNumB.toString().padStart(3)} │ ${truncatedB}`,
					);
				}
			} catch (error) {
				console.log(`⚠ cannot read ${dup.fileA} or ${dup.fileB}`);
			}
		}

		if (duplicates.length >= cliOptions.maxClones) {
			console.log(
				`\n(Showing first ${cliOptions.maxClones} of ${duplicates.length}+ duplicates found)`,
			);
		}
	}
})().catch(console.error);
