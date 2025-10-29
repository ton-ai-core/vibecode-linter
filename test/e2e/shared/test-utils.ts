import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// CHANGE: Cached E2E test utilities for performance
// WHY: CLI execution is slow, cache results to avoid repeated runs
// QUOTE(ТЗ): "кешировать на запуск. 1 раз запустил и проверяешь"
// REF: REQ-E2E-CACHE-PERFORMANCE
// PURITY: SHELL - cached test execution utilities
// INVARIANT: Single CLI execution per test suite, cached results

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// CHANGE: Create test paths for E2E tests
// WHY: Centralize path creation logic
// INVARIANT: Consistent paths across all E2E tests
export const createTestPaths = (): {
	testProjectPath: string;
	linterBin: string;
} => ({
	testProjectPath: path.join(__dirname, "../../../e2e-test-project/src"),
	linterBin: path.join(__dirname, "../../../src/bin/vibecode-linter.ts"),
});

// CHANGE: Cached linter execution function
// WHY: Cache results to avoid repeated slow CLI runs
// INVARIANT: Same input always returns same cached result
export const runLinterCached = (
	linterBin: string,
	targetPath: string,
	args: string = "",
): LinterResult => {
	const cacheKey = `${linterBin}|${targetPath}|${args}`;

	// Return cached result if available
	const cached = resultCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	let output = "";
	let stderr = "";
	let exitCode = 0;

	try {
		output = execSync(`npx tsx ${linterBin} ${targetPath} ${args}`, {
			encoding: "utf-8",
			stdio: "pipe",
			timeout: 60000, // 60 second timeout for first run
		});
	} catch (error) {
		const execError = error as {
			stdout?: string;
			stderr?: string;
			status?: number;
		};
		output = execError.stdout ?? "";
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

	return {
		normal: runLinterCached(linterBin, testProjectPath),
		duplicates: runLinterCached(linterBin, testProjectPath, "--duplicates"),
	};
};
