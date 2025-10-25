// CHANGE: Reimplement TypeScript diagnostics using the Compiler API (no shelling out to tsc)
// WHY: Enforce correctness with respect to tsconfig.json (solution-style + extends) and check exactly the subtree passed by targetPath
// QUOTE(ТЗ): "Исходить из того, что описано в tsconfig.json; применять именно эти правила"
// REF: REQ-TS-SOLUTION-STYLE, REQ-LINT-FIX
// FORMAT THEOREME:
// Let R be the root tsconfig with project references P = {p_i}. For any targetPath T, we select p in P whose ParsedCommandLine.fileNames intersects T (file or directory).
// We build Program from p (respecting extends tsconfig.base.json) and filter diagnostics to files within T. Thus diagnostics(T) ⊆ diagnostics(p) and is consistent with TypeScript semantics.

import * as path from "node:path";
import ts from "typescript";

import type { TypeScriptMessage } from "../../core/types/index.js";

// CHANGE: Add optional debug logger controlled by env VCL_DEBUG_TS
// WHY: Diagnose where diagnostics are lost: project selection, pre/post filter counts
// QUOTE(ТЗ): "Дать проверяемые решения... Добавить рациональные комментарии"
// REF: REQ-TS-SOLUTION-STYLE, REQ-LINT-FIX
const ENV: NodeJS.ProcessEnv & { VCL_DEBUG_TS?: string } = process.env;
const VCL_DEBUG_TS = ENV.VCL_DEBUG_TS === "1";
function debugLog(message: string): void {
	if (VCL_DEBUG_TS) {
		// FORMAT THEOREME: Logging is side-effect only when flag is set; no type-unsafe variadics
		console.error("[TS-DEBUG]", message);
	}
}

// CHANGE: Condensed debug snapshot to keep getTypeScriptDiagnostics simple
// WHY: Reduce function complexity/lines while keeping rich diagnostics behind a flag
// REF: REQ-LINT-FIX
function debugSnapshot(s: {
	readonly rootTsconfig: string;
	readonly selectedConfig: string;
	readonly targetPath: string;
	readonly projectFiles: number;
	readonly preFilter: number;
	readonly postFilter: number;
	readonly samplePre: ReadonlyArray<string | undefined>;
	readonly samplePost: ReadonlyArray<string>;
}): void {
	if (!VCL_DEBUG_TS) return;
	debugLog(`root=${s.rootTsconfig} selected=${s.selectedConfig}`);
	debugLog(
		`target=${s.targetPath} projectFiles=${s.projectFiles} pre=${s.preFilter} post=${s.postFilter}`,
	);
	const pre = s.samplePre
		.map((x) =>
			typeof x === "string" && x.length > 0 ? path.resolve(x) : "no-file",
		)
		.join(" | ");
	const post = s.samplePost.join(" | ");
	debugLog(`preSample=${pre}`);
	debugLog(`postSample=${post}`);
}

/** Parsed project representation. */
interface ParsedProject {
	readonly configPath: string;
	readonly parsed: ts.ParsedCommandLine;
}

/** Safe wrappers to avoid passing object methods as unbound callbacks (eslint this-scoping). */
const sysReadFile = (f: string): string | undefined => ts.sys.readFile(f);
const sysFileExists = (f: string): boolean => ts.sys.fileExists(f);

// CHANGE: Extract helpers to reduce complexity of loaders and main function
// WHY: Satisfy complexity constraints and keep logic testable
// REF: REQ-LINT-FIX

/** Resolve a reference path to a concrete tsconfig file (support file or directory). */
function resolveRefConfigPath(baseDir: string, refPath: string): string | null {
	const candidate = path.resolve(baseDir, refPath);

	// Direct file reference
	if (sysFileExists(candidate) && candidate.endsWith(".json")) {
		return candidate;
	}

	// Directory reference (or unresolved path) -> find tsconfig.json inside
	const found =
		ts.findConfigFile(candidate, sysFileExists, "tsconfig.json") ??
		ts.findConfigFile(candidate, sysFileExists);
	return typeof found === "string" ? found : null;
}

/** Compute Program rootNames, ensuring a freshly-created target file is included if needed. */
function computeRootNames(
	parsed: ts.ParsedCommandLine,
	absTarget: string,
): ReadonlyArray<string> {
	const isTsFile =
		absTarget.endsWith(".ts") ||
		absTarget.endsWith(".tsx") ||
		absTarget.endsWith(".mts") ||
		absTarget.endsWith(".cts");
	const fileExists = isTsFile && ts.sys.fileExists(absTarget);
	const alreadyIncluded =
		isTsFile && parsed.fileNames.some((f) => path.resolve(f) === absTarget);
	return fileExists && !alreadyIncluded
		? [...parsed.fileNames, absTarget]
		: parsed.fileNames;
}

/** Resolve target path and infer whether it denotes a directory (not a TS file). */
function resolveTarget(targetPath: string): {
	readonly absTarget: string;
	readonly isDir: boolean;
} {
	const absTarget = path.resolve(targetPath);
	const isDir =
		!absTarget.endsWith(".ts") &&
		!absTarget.endsWith(".tsx") &&
		!absTarget.endsWith(".mts") &&
		!absTarget.endsWith(".cts");
	return { absTarget, isDir };
}

// CHANGE: Common helpers to avoid duplication of "is under target dir" checks
// WHY: Eliminate jscpd duplicates and centralize path logic
// QUOTE(ТЗ): "В коде не должно быть дублей"
// REF: REQ-LINT-FIX, REQ-20250210-MODULAR-ARCH
// FORMAT THEOREME: For any absolute target T and candidate path F,
//   Under(T, F) := (isDir(T) ? F startsWith (T + path.sep or T + "/") : resolve(F) = T)
function dirPrefixes(absTarget: string): Readonly<[string, string]> {
	const a = absTarget + path.sep;
	const b = `${absTarget}/`;
	return [a, b];
}

function isUnderTargetPath(
	filePath: string,
	absTarget: string,
	isDir: boolean,
): boolean {
	if (isDir) {
		const [a, b] = dirPrefixes(absTarget);
		return filePath.startsWith(a) || filePath.startsWith(b);
	}
	return path.resolve(filePath) === absTarget;
}

/**
 * Load and fully resolve a tsconfig (handles extends).
 *
 * @param configPath Absolute path to tsconfig.json-like file
 * @returns ParsedCommandLine with resolved options and fileNames
 */
function loadParsedConfig(configPath: string): ts.ParsedCommandLine {
	const read = ts.readConfigFile(configPath, sysReadFile);
	const baseDir = path.dirname(configPath);
	// CHANGE: Use ts.sys host to reflect actual FS semantics
	// WHY: Keep parity with tsc CLI resolution of include/exclude/extends
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		baseDir,
		undefined,
		configPath,
	);
	return parsed;
}

/**
 * Load root tsconfig.json and all referenced projects (if any).
 *
 * @param rootTsconfigPath Absolute path to root tsconfig.json
 */
function loadRootAndReferences(
	rootTsconfigPath: string,
): ReadonlyArray<ParsedProject> {
	const rootParsed = loadParsedConfig(rootTsconfigPath);
	const projects: ParsedProject[] = [];

	const raw = rootParsed.raw as
		| { readonly references?: ReadonlyArray<{ readonly path: string }> }
		| undefined;
	const references = raw?.references ?? [];

	for (const ref of references) {
		const baseDir = path.dirname(rootTsconfigPath);
		const refConfigPath = resolveRefConfigPath(baseDir, ref.path);
		if (refConfigPath !== null) {
			projects.push({
				configPath: refConfigPath,
				parsed: loadParsedConfig(refConfigPath),
			});
		}
	}

	// If there are no references, treat root as a single project
	if (projects.length === 0) {
		projects.push({ configPath: rootTsconfigPath, parsed: rootParsed });
	}

	return projects;
}

/**
 * CHANGE: Helper to test whether a parsed project covers a given absolute target path.
 * WHY: Reduce cyclomatic complexity in pickProjectForTarget by extracting the coverage predicate
 * QUOTE(ТЗ): "Снизить сложность функций, убрать дублирование"
 * REF: REQ-LINT-FIX
 */
function projectCoversPath(
	p: ParsedProject,
	absTarget: string,
	isDir: boolean,
): boolean {
	return p.parsed.fileNames.some((f) => isUnderTargetPath(f, absTarget, isDir));
}

/**
 * Pick the first project that covers targetPath (file or directory) using parsed.fileNames.
 *
 * @param targetPath Path passed by user (file or directory)
 * @param projects Parsed projects loaded from root references (non-empty)
 */
function pickProjectForTarget(
	targetPath: string,
	projects: ReadonlyArray<ParsedProject>,
): ParsedProject {
	// CHANGE: Explicit non-empty guard for soundness
	// WHY: TypeScript cannot infer non-emptiness from construction
	if (projects.length === 0) {
		throw new Error(
			"No parsed TypeScript projects were found from root tsconfig.json",
		);
	}

	const { absTarget, isDir } = resolveTarget(targetPath);

	for (const p of projects) {
		if (projectCoversPath(p, absTarget, isDir)) return p;
	}

	// CHANGE: Fallback to the first project if nothing matched (e.g., root or newly added path)
	// WHY: Provide robust behavior while encouraging user to add proper reference
	const first = projects[0];
	if (first === undefined) {
		// CHANGE: Defensive guard for soundness (should be unreachable due to previous check)
		// WHY: Satisfy linter without non-null assertion
		throw new Error("Invariant violated: expected at least one parsed project");
	}
	return first;
}

/** Convert TS Diagnostic into our TypeScriptMessage (if file-scoped). */
function diagToMessage(diag: ts.Diagnostic): TypeScriptMessage | null {
	const file = diag.file;
	if (file === undefined) {
		return null;
	}
	const pos = diag.start ?? 0;
	const { line, character } = ts.getLineAndCharacterOfPosition(file, pos);
	const messageText = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
	const severity = diag.category === ts.DiagnosticCategory.Error ? 2 : 1;
	return {
		code: `TS${diag.code}`,
		severity,
		message: messageText,
		line: line + 1,
		column: character + 1,
		source: "typescript",
		filePath: path.resolve(file.fileName),
	};
}

/** Keep only diagnostics from files under targetPath (file or directory). */
function filterMessagesByTargetPath(
	messages: ReadonlyArray<TypeScriptMessage>,
	targetPath: string,
): ReadonlyArray<TypeScriptMessage> {
	const { absTarget, isDir } = resolveTarget(targetPath);

	return messages.filter((m) =>
		isUnderTargetPath(m.filePath, absTarget, isDir),
	);
}

/**
 * Получает диагностику TypeScript для указанного targetPath, исходя строго из настроек tsconfig.json (solution-style + extends).
 *
 * @param targetPath Путь для проверки (директория или файл)
 * @returns Промис с массивом сообщений (только из targetPath)
 * @invariant Конфигурация проекта берётся из корневого tsconfig.json и его references; extends на tsconfig.base.json применяются TypeScript API
 */
export function getTypeScriptDiagnostics(
	targetPath: string,
): Promise<ReadonlyArray<TypeScriptMessage>> {
	const rootTsconfig = path.resolve("tsconfig.json");
	const projects = loadRootAndReferences(rootTsconfig);
	// CHANGE: pickProjectForTarget already guarantees non-empty selection or throws
	const selected = pickProjectForTarget(targetPath, projects);
	const absTarget = path.resolve(targetPath);

	// CHANGE: Compute root names with fresh file inclusion logic extracted (reduces complexity)
	const rootNames = computeRootNames(selected.parsed, absTarget);

	const program = ts.createProgram({
		rootNames,
		options: selected.parsed.options,
	});

	const diags: ReadonlyArray<ts.Diagnostic> = ts.getPreEmitDiagnostics(program);

	const allMessages: TypeScriptMessage[] = [];
	for (const d of diags) {
		const m = diagToMessage(d);
		if (m !== null) {
			allMessages.push(m);
		}
	}
	const filtered = filterMessagesByTargetPath(allMessages, targetPath);
	debugSnapshot({
		rootTsconfig,
		selectedConfig: selected.configPath,
		targetPath,
		projectFiles: selected.parsed.fileNames.length,
		preFilter: diags.length,
		postFilter: filtered.length,
		samplePre: diags.slice(0, 3).map((d) => d.file?.fileName),
		samplePost: filtered.slice(0, 3).map((m) => m.filePath),
	});
	return Promise.resolve(filtered);
}
