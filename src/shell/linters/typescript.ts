// CHANGE: Reimplement TypeScript diagnostics using the Compiler API (no shelling out to tsc)
// WHY: Enforce correctness with respect to tsconfig.json (solution-style + extends) and check exactly the subtree passed by targetPath
// QUOTE(ТЗ): "Исходить из того, что описано в tsconfig.json; применять именно эти правила"
// REF: REQ-TS-SOLUTION-STYLE, REQ-LINT-FIX
// PURITY: SHELL
// EFFECT: Effect<TypeScriptMessage[], ParseError | InvariantViolation>
// FORMAT THEOREME:
// Let R be the root tsconfig with project references P = {p_i}. For any targetPath T, we select p in P whose ParsedCommandLine.fileNames intersects T (file or directory).
// We build Program from p (respecting extends tsconfig.base.json) and filter diagnostics to files within T. Thus diagnostics(T) ⊆ diagnostics(p) and is consistent with TypeScript semantics.

import * as path from "node:path";

import { Effect, pipe } from "effect";
import ts from "typescript";

import { InvariantViolation, ParseError } from "../../core/errors.js";
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
	readonly samplePre: readonly (string | undefined)[];
	readonly samplePost: readonly string[];
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
): readonly string[] {
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
): readonly ParsedProject[] {
	const rootParsed = loadParsedConfig(rootTsconfigPath);
	const projects: ParsedProject[] = [];

	const raw = rootParsed.raw as
		| { readonly references?: readonly { readonly path: string }[] }
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
	projects: readonly ParsedProject[],
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
	const { file } = diag;
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
	messages: readonly TypeScriptMessage[],
	targetPath: string,
): readonly TypeScriptMessage[] {
	const { absTarget, isDir } = resolveTarget(targetPath);

	return messages.filter((m) =>
		isUnderTargetPath(m.filePath, absTarget, isDir),
	);
}

/**
 * CHANGE: Extracted helper to load and select TypeScript project
 * WHY: Reduce getTypeScriptDiagnostics line count to satisfy ESLint max-lines-per-function
 * QUOTE(LINT): "Function 'getTypeScriptDiagnostics' has too many lines (56). Maximum allowed is 50"
 * REF: ESLint max-lines-per-function
 */
function loadAndSelectProject(
	targetPath: string,
): Effect.Effect<
	{ rootTsconfig: string; selected: ParsedProject },
	ParseError | InvariantViolation
> {
	return Effect.gen(function* () {
		const rootTsconfig = path.resolve("tsconfig.json");

		// CHANGE: Explicit type annotation to satisfy TypeScript strict mode
		// WHY: yield* in Effect.gen requires explicit types when strictNullChecks enabled
		// REF: TypeScript TS7022 - implicitly has type 'any'
		const projects: readonly ParsedProject[] = yield* Effect.try({
			try: () => loadRootAndReferences(rootTsconfig),
			catch: (error) =>
				new ParseError({
					entity: "eslint",
					detail: `Failed to load tsconfig.json: ${String(error)}`,
				}),
		});

		const selected: ParsedProject = yield* Effect.try({
			try: () => pickProjectForTarget(targetPath, projects),
			catch: (error) =>
				new InvariantViolation({
					where: "pickProjectForTarget",
					detail: `No TypeScript project covers targetPath: ${String(error)}`,
				}),
		});

		return { rootTsconfig, selected };
	});
}

/**
 * CHANGE: Extracted helper to create TS program and get diagnostics
 * WHY: Reduce getTypeScriptDiagnostics line count to satisfy ESLint max-lines-per-function
 * QUOTE(LINT): "Function 'getTypeScriptDiagnostics' has too many lines (56). Maximum allowed is 50"
 * REF: ESLint max-lines-per-function
 */
function getProgramDiagnostics(
	selected: ParsedProject,
	targetPath: string,
): Effect.Effect<{
	diags: readonly ts.Diagnostic[];
	allMessages: TypeScriptMessage[];
}> {
	return Effect.gen(function* () {
		const absTarget = path.resolve(targetPath);
		const rootNames = computeRootNames(selected.parsed, absTarget);

		// CHANGE: Explicit type annotation to satisfy TypeScript strict mode
		// WHY: yield* in Effect.gen requires explicit types when strictNullChecks enabled
		// REF: TypeScript TS7022 - implicitly has type 'any'
		const program: ts.Program = yield* Effect.sync(() =>
			ts.createProgram({
				rootNames,
				options: selected.parsed.options,
			}),
		);

		const diags: readonly ts.Diagnostic[] = yield* Effect.sync(() =>
			ts.getPreEmitDiagnostics(program),
		);

		// CHANGE: Explicit type annotations for reduce accumulator and parameter
		// WHY: TypeScript requires explicit types in strict mode
		// REF: TypeScript TS7006 - Parameter implicitly has 'any' type
		const allMessages = pipe(diags, (diagnostics: readonly ts.Diagnostic[]) =>
			diagnostics.reduce<TypeScriptMessage[]>(
				(acc: TypeScriptMessage[], d: ts.Diagnostic) => {
					const m = diagToMessage(d);
					if (m !== null) {
						acc.push(m);
					}
					return acc;
				},
				[],
			),
		);

		return { diags, allMessages };
	});
}

/**
 * Получает диагностику TypeScript для указанного targetPath, исходя строго из настроек tsconfig.json (solution-style + extends).
 *
 * CHANGE: Refactored to reduce line count by extracting helpers
 * WHY: Satisfy ESLint max-lines-per-function rule (was 56 lines > 50 limit)
 * QUOTE(ТЗ): "Effect-TS для всех эффектов: Effect<Success, Error, Requirements>"
 * REF: Architecture plan - Effect-based SHELL, ESLint max-lines-per-function
 *
 * @param targetPath Путь для проверки (директория или файл)
 * @returns Effect с массивом сообщений (только из targetPath) или typed error
 *
 * @pure false - reads filesystem, creates TS program
 * @effect Effect<TypeScriptMessage[], ParseError | InvariantViolation>
 * @invariant Конфигурация проекта берётся из корневого tsconfig.json и его references; extends на tsconfig.base.json применяются TypeScript API
 * @complexity O(n) where n = number of files in project
 */
export function getTypeScriptDiagnostics(
	targetPath: string,
): Effect.Effect<
	readonly TypeScriptMessage[],
	ParseError | InvariantViolation
> {
	return Effect.gen(function* () {
		const equivalentCommand = `npx tsc --project tsconfig.json --noEmit --pretty false`;
		// CHANGE: Log TypeScript diagnostic equivalent command on execution
		// WHY: Although diagnostics run via Compiler API, operators need a CLI they can replay
		// QUOTE(USER-LOG-CMDS): "Потом хочу видеть команды для вызова ошибок ... typescript"
		// REF: USER-LOG-CMDS
		// SOURCE: n/a
		// FORMAT THEOREM: ∀target: logged command approximates internal TypeScript run
		// PURITY: SHELL
		// INVARIANT: Equivalent command string stays synced with API options (tsconfig + noEmit)
		// COMPLEXITY: O(1)
		console.log(`🧪 Running TypeScript diagnostics on: ${targetPath}`);
		console.log(`   ↳ Equivalent command: ${equivalentCommand}`);
		const { rootTsconfig, selected } = yield* loadAndSelectProject(targetPath);
		const { diags, allMessages } = yield* getProgramDiagnostics(
			selected,
			targetPath,
		);

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

		return filtered;
	});
}
