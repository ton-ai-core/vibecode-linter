import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { createIsolatedE2EProject } from "../../utils/tempProject.js";

// CHANGE: Add ANSI escape code removal utility
// WHY: Linter output contains color codes that need normalization
// QUOTE(ТЗ): "убрать ANSI, привести пути к относительным"
// REF: user-request-e2e-isolation
// INVARIANT: ∀ text: stripAnsi(stripAnsi(text)) = stripAnsi(text)
const stripAnsi = (text: string): string => {
	// Remove ANSI escape sequences (colors, cursor movement, etc.)
	// Use String.fromCharCode to avoid control character linting issues
	const escapeChar = String.fromCharCode(27); // ESC character
	const ansiRegex = new RegExp(`${escapeChar}\\[[0-9;]*[a-zA-Z]`, "g");
	return text.replace(ansiRegex, "");
};

// CHANGE: Add output normalization utility
// WHY: Need to normalize paths and headers for deterministic testing
// QUOTE(ТЗ): "нормализовать пути/заголовки"
// REF: user-request-e2e-isolation
// INVARIANT: Converts absolute paths to relative src/ paths
const normalizeOutput = (output: string, isolatedRoot: string): string => {
	let normalized = stripAnsi(output);

	// CHANGE: Replace absolute paths with relative src/ paths
	// WHY: Tests should check relative paths, not absolute temp paths
	// INVARIANT: /tmp/path/src/file.ts:line:col → src/file.ts:line:col
	const srcPath = path.join(isolatedRoot, "src");
	const escapedSrcPath = srcPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	normalized = normalized.replace(new RegExp(escapedSrcPath, "g"), "src");

	// CHANGE: Also replace the isolated root path itself
	// WHY: Some error messages might show the root path
	const escapedRootPath = isolatedRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	normalized = normalized.replace(new RegExp(escapedRootPath, "g"), ".");

	return normalized;
};

// CHANGE: Cached E2E test utilities for performance
// WHY: CLI execution is slow, cache results to avoid repeated runs
// QUOTE(ТЗ): "кешировать на запуск. 1 раз запустил и проверяешь"
// REF: REQ-E2E-CACHE-PERFORMANCE
// PURITY: SHELL - cached test execution utilities
// INVARIANT: Single CLI execution per test suite, cached results

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CHANGE: Cache isolated E2E project for entire test suite
// WHY: Creating git repo is expensive (~100ms), cache for all tests
// QUOTE(ТЗ): "E2E тесты изменились потому что у нас в diff появляется при коммитах"
// REF: REQ-E2E-DETERMINISTIC, user-request-e2e-isolation
// INVARIANT: Single isolated copy per test suite run, ∀ test: uses_same_isolated_copy
// POSTCONDITION: Cleanup runs once after all tests complete
let isolatedE2EProject: { path: string; cleanup: () => void } | null = null;

export interface LinterResult {
	readonly output: string;
	readonly exitCode: number;
	readonly stderr?: string;
}

export interface ParsedError {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly rule: string;
	readonly source: string;
	readonly message: string;
	readonly codeContext: readonly string[];
	readonly cursorLine: string;
}

// CHANGE: Cache for CLI execution results
// WHY: Avoid repeated slow CLI runs in E2E tests
// INVARIANT: Results cached per target path and args combination
const resultCache = new Map<string, LinterResult>();

// CHANGE: Create test paths with isolated E2E project for deterministic output
// WHY: Linter shows git diff context which changes with main repo commits
// QUOTE(ТЗ): "E2E тесты изменились потому что у нас в diff появляется при коммитах"
// REF: REQ-E2E-DETERMINISTIC, user-request-e2e-isolation
// INVARIANT: ∀ test_run: git_status(isolated_copy) = CLEAN
// POSTCONDITION: Isolated copy created once, reused for all tests, cleaned after suite
export const createTestPaths = (): {
	testProjectPath: string;
	linterBin: string;
} => {
	// CHANGE: Create isolated copy with git on first access
	// WHY: Ensures deterministic git context independent of main repo
	// INVARIANT: created_once → reused_everywhere → cleaned_once
	if (isolatedE2EProject === null) {
		const sourceDir = path.join(__dirname, "../../../e2e-test-project");
		const tempProject = createIsolatedE2EProject(sourceDir);
		// CHANGE: Store root path (cwd), not src/ path
		// WHY: Linter needs CWD = project root to find tsconfig.json via path.resolve("tsconfig.json")
		// INVARIANT: Config files accessible via path.resolve() from cwd
		isolatedE2EProject = {
			path: tempProject.cwd,
			cleanup: tempProject.cleanup,
		};

		// CHANGE: Log isolated project path for debugging
		// WHY: Help user understand where E2E project is stored
		console.log(`🔍 E2E isolated project created at: ${tempProject.cwd}`);

		// CHANGE: Cleanup after all tests complete
		// WHY: Remove temporary files, avoid disk space leaks
		// INVARIANT: cleanup runs exactly once per test suite
		afterAll(() => {
			if (isolatedE2EProject !== null) {
				isolatedE2EProject.cleanup();
				isolatedE2EProject = null;
			}
		});
	}

	return {
		// CHANGE: Return root path, not src/ path
		// WHY: runLinterCached will cd into this directory, then run linter on "./src"
		testProjectPath: isolatedE2EProject.path,
		linterBin: path.join(__dirname, "../../../src/bin/vibecode-linter.ts"),
	};
};

// CHANGE: Cached linter execution function with deterministic environment
// WHY: Linter needs CWD = project root and deterministic environment variables
// INVARIANT: Same input always returns same cached result
// POSTCONDITION: Linter runs with cwd = projectRoot, normalized output
export const runLinterCached = (
	linterBin: string,
	projectRoot: string,
	targetPath: string,
	args: string = "",
): LinterResult => {
	const cacheKey = `${linterBin}|${projectRoot}|${targetPath}|${args}`;

	// Return cached result if available
	const cached = resultCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	let output = "";
	let stderr = "";
	let exitCode = 0;

	try {
		// CHANGE: Set deterministic environment variables
		// WHY: Ensure consistent locale and timezone for reproducible output
		// QUOTE(ТЗ): "Установить LANG/LC_ALL=en_US.UTF-8, TZ=UTC"
		// REF: user-request-e2e-isolation
		const deterministicEnv = {
			...process.env,
			LANG: "en_US.UTF-8",
			LC_ALL: "en_US.UTF-8",
			TZ: "UTC",
			// Disable color output for consistent formatting
			NO_COLOR: "1",
			FORCE_COLOR: "0",
		};

		// CHANGE: Set CWD to projectRoot so linter can find tsconfig.json
		// WHY: Linter uses path.resolve("tsconfig.json") which is relative to CWD
		// QUOTE(ТЗ): "E2E тесты изменились потому что у нас в diff появляется при коммитах"
		// REF: REQ-E2E-DETERMINISTIC, user-request-e2e-isolation
		const rawOutput = execSync(`npx tsx ${linterBin} ${targetPath} ${args}`, {
			encoding: "utf-8",
			stdio: "pipe",
			timeout: 60000, // 60 second timeout for first run
			cwd: projectRoot,
			env: deterministicEnv,
		});

		// CHANGE: Normalize output for deterministic testing
		// WHY: Remove ANSI codes and normalize paths
		// INVARIANT: Normalized output is deterministic across runs
		output = normalizeOutput(rawOutput, projectRoot);
	} catch (error) {
		const execError = error as {
			stdout?: string;
			stderr?: string;
			status?: number;
		};

		// CHANGE: Handle error output from stderr when stdout is empty
		// WHY: Linter may output errors to stderr on failure
		// QUOTE(ТЗ): "На ошибках брать error.stdout"
		// REF: user-request-e2e-isolation
		const rawOutput = execError.stdout ?? execError.stderr ?? "";
		output = normalizeOutput(rawOutput, projectRoot);
		stderr = execError.stderr ?? "";
		exitCode = execError.status ?? 1;
	}

	const result = { output, exitCode, stderr };
	resultCache.set(cacheKey, result);
	return result;
};

// CHANGE: Check if line is valid context line
// WHY: Reduce complexity by extracting validation logic
const isValidContextLine = (line: string | undefined): line is string =>
	typeof line === "string" && !line.startsWith("[ERROR]") && line.trim() !== "";

// CHANGE: Process cursor line and add cursor indicator
// WHY: Extract cursor processing logic to reduce complexity
const processCursorLine = (
	lines: readonly string[],
	index: number,
	codeContext: string[],
): string => {
	const contextLine = lines[index];
	if (typeof contextLine !== "string") return "";

	codeContext.push(contextLine);

	const nextLine = lines[index + 1];
	if (
		index + 1 < lines.length &&
		typeof nextLine === "string" &&
		nextLine.trim().match(/^\^+$/)
	) {
		codeContext.push(nextLine);
	}

	return contextLine;
};

// CHANGE: Extract code context for a single error
// WHY: Separate concern for better maintainability
// INVARIANT: Returns context lines and cursor line for error
const extractErrorContext = (
	lines: readonly string[],
	startIndex: number,
): { codeContext: string[]; cursorLine: string } => {
	const codeContext: string[] = [];
	let cursorLine = "";

	for (let j = startIndex + 1; j < lines.length && j < startIndex + 10; j++) {
		const contextLine = lines[j];

		if (!isValidContextLine(contextLine)) break;

		if (contextLine.trim().startsWith(">")) {
			cursorLine = processCursorLine(lines, j, codeContext);
			break;
		} else {
			codeContext.push(contextLine);
		}
	}

	return { codeContext, cursorLine };
};

// CHANGE: Validate error match components
// WHY: Extract validation logic to reduce complexity
const isValidErrorMatch = (match: RegExpMatchArray): boolean => {
	const [, file, lineNum, colNum, rule, source, message] = match;
	return [file, lineNum, colNum, rule, source, message].every(
		(component) => typeof component === "string",
	);
};

// CHANGE: Create parsed error from match
// WHY: Extract error creation logic to reduce complexity
const createParsedError = (
	match: RegExpMatchArray,
	codeContext: string[],
	cursorLine: string,
): ParsedError => {
	const [, file, lineNum, colNum, rule, source, message] = match;

	return {
		file: path.basename(file as string),
		line: parseInt(lineNum as string, 10),
		column: parseInt(colNum as string, 10),
		rule: rule as string,
		source: source as string,
		message: message as string,
		codeContext,
		cursorLine,
	};
};

// CHANGE: Parse error output into structured format
// WHY: Enable precise validation of error format and cursor positioning
// INVARIANT: Each error has file, line, column, rule, and code context
export const parseErrorOutput = (output: string): readonly ParsedError[] => {
	const errors: ParsedError[] = [];
	const lines = output.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (typeof line !== "string" || line.length === 0) continue;

		const errorMatch = line.match(
			/^\[ERROR\]\s+(.+?):(\d+):(\d+)\s+(.+?)\s+\((.+?)\)\s+—\s+(.+)$/,
		);

		if (!errorMatch || !isValidErrorMatch(errorMatch)) continue;

		const { codeContext, cursorLine } = extractErrorContext(lines, i);
		const parsedError = createParsedError(errorMatch, codeContext, cursorLine);

		errors.push(parsedError);
	}

	return errors;
};

// CHANGE: Extract summary statistics from output
// WHY: Validate exact error counts and summary format
// INVARIANT: Summary contains total, TypeScript, ESLint, and Biome counts
export const parseSummary = (
	output: string,
): {
	readonly total: number;
	readonly typescript: number;
	readonly eslint: number;
	readonly biome: number;
	readonly warnings: number;
} => {
	const summaryMatch = output.match(
		/📊 Total: (\d+) errors \((\d+) TypeScript, (\d+) ESLint, (\d+) Biome\), (\d+) warnings\./,
	);

	if (!summaryMatch) {
		return { total: 0, typescript: 0, eslint: 0, biome: 0, warnings: 0 };
	}

	const [, total, typescript, eslint, biome, warnings] = summaryMatch;

	return {
		total: parseInt(total ?? "0", 10),
		typescript: parseInt(typescript ?? "0", 10),
		eslint: parseInt(eslint ?? "0", 10),
		biome: parseInt(biome ?? "0", 10),
		warnings: parseInt(warnings ?? "0", 10),
	};
};

// CHANGE: Get cached linter results for main test project
// WHY: Single source of truth for E2E test validation
// INVARIANT: All tests use same cached execution result
export const getCachedLinterResults = (): {
	normal: LinterResult;
	duplicates: LinterResult;
} => {
	const { testProjectPath, linterBin } = createTestPaths();

	// CHANGE: Lint "src" directory, with CWD = testProjectPath (project root)
	// WHY: Linter needs CWD = project root to find tsconfig.json via path.resolve()
	return {
		normal: runLinterCached(linterBin, testProjectPath, "src", ""),
		duplicates: runLinterCached(
			linterBin,
			testProjectPath,
			"src",
			"--duplicates",
		),
	};
};
