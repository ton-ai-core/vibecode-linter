// CHANGE: Introduce explicit preflight checks for peer dependencies and execution context
// WHY: Provide actionable, English diagnostics before running linters; avoid MODULE_NOT_FOUND at runtime
// QUOTE(ТЗ): "При вызове команды писать внятно что необходимо сделать"
// REF: REQ-CLI-PREFLIGHT-PEERS
// SOURCE: n/a

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Preflight issue codes enumerating all invariant violations we can detect prior to run.
 *
 * Invariants:
 * - TypeScript must be resolvable from the project (peer dependency).
 * - Biome must be resolvable from the project (peer dependency).
 * - The command should be executed from a project root (must contain package.json).
 * - Running from an isolated npx cache should be warned about (advisory).
 */
export type PreflightIssueCode =
	| "missingTypescript"
	| "missingBiome"
	| "noPackageJson"
	| "npxIsolated";

/**
 * Result of preflight checks.
 *
 * @property ok True if no blocking issues found (advisories may still exist)
 * @property issues List of detected issues (blocking and advisory)
 */
export interface PreflightResult {
	readonly ok: boolean;
	readonly issues: ReadonlyArray<PreflightIssueCode>;
}

/**
 * Check if the current working directory looks like a project root (has package.json).
 *
 * Invariant: users should run CLI from the project root to ensure peer dependency resolution.
 */
export function hasPackageJson(cwd: string): boolean {
	// CHANGE: explicit existence check
	// WHY: Ensures we emit a clear message if user runs outside project root
	// QUOTE(ТЗ): "При вызове команды писать внятно что необходимо сделать"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	const pkg = path.join(cwd, "package.json");
	try {
		const stat = fs.statSync(pkg);
		return stat.isFile();
	} catch {
		return false;
	}
}

/**
 * Resolve a module from a specific cwd without mutating global module paths.
 *
 * Postcondition: returns true if resolution succeeds, false otherwise.
 */
export function canResolveFromCwd(moduleName: string, cwd: string): boolean {
	try {
		// CHANGE: bounded resolution via explicit paths
		// WHY: Mirrors how Node resolves peer deps in consumer projects
		// QUOTE(ТЗ): "Использовать версию инструмента проекта"
		// REF: REQ-CLI-PREFLIGHT-PEERS
		require.resolve(moduleName, { paths: [cwd] });
		return true;
	} catch {
		return false;
	}
}

/**
 * Detect if running from an isolated npx cache directory (advisory).
 *
 * Invariant: Running from ~/.npm/_npx/** may hide project devDependencies from Node's resolver.
 */
export function isNpxIsolatedProcess(
	currentDir: string,
	argv0: string,
	execPath: string,
): boolean {
	// CHANGE: heuristic detection for isolation
	// WHY: Provide clear guidance about using locally installed CLI
	// QUOTE(ТЗ): "Писать внятные подсказки при проблемах запуска"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	const markers = ["/.npm/_npx/", "\\.npm\\_npx\\"]; // POSIX and Windows
	const haystack = [currentDir, argv0, execPath].join("|");
	return markers.some((m) => haystack.includes(m));
}

// CHANGE: Extract conditional push into helper to reduce cyclomatic complexity
// WHY: Satisfy ESLint complexity limit by delegating branching
// QUOTE(ТЗ): "Исправить все ошибки линтера"
// REF: REQ-LINT-FIX
/**
 * Append an issue to the accumulator if the condition holds.
 *
 * Invariant: pushes only when condition is true.
 */
function pushIssueIf(
	condition: boolean,
	code: PreflightIssueCode,
	out: PreflightIssueCode[],
): void {
	if (condition) {
		out.push(code);
	}
}

/**
 * Run preflight checks and return a structured result.
 *
 * Preconditions:
 * - None
 *
 * Postconditions:
 * - ok === true iff no blocking issues are found (missing TypeScript, missing Biome, or no package.json)
 * - issues contains "npxIsolated" as advisory when detected
 *
 * Complexity:
 * - O(1) fs checks and sync require.resolve attempts; no file traversal
 */
export function runPreflight(cwd: string = process.cwd()): PreflightResult {
	const issues: PreflightIssueCode[] = [];

	const hasPkg = hasPackageJson(cwd);
	if (!hasPkg) {
		issues.push("noPackageJson");
	}

	// Only attempt peer resolution if cwd looks like a project
	// (still attempt though, because user may be in subfolder below a root with hoisted node_modules)
	// CHANGE: Detect TypeScript presence via package.json resolution as well
	// WHY: allow robust detection during tests and in projects where TypeScript is present without a resolvable JS entry
	// QUOTE(ТЗ): "Инварианты должны быть проверяемыми без ложных отрицаний"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	const hasTs =
		canResolveFromCwd("typescript", cwd) ||
		canResolveFromCwd("typescript/package.json", cwd);
	if (!hasTs) {
		issues.push("missingTypescript");
	}

	// CHANGE: Detect Biome presence via package.json resolution as it is a CLI-first package
	// WHY: '@biomejs/biome' may not expose a require-able JS entry; resolving its package.json is a robust presence check
	// QUOTE(ТЗ): "При вызове команды писать внятно что необходимо сделать"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	const hasBiome =
		canResolveFromCwd("@biomejs/biome", cwd) ||
		canResolveFromCwd("@biomejs/biome/package.json", cwd);
	if (!hasBiome) {
		issues.push("missingBiome");
	}

	pushIssueIf(
		isNpxIsolatedProcess(__dirname, process.argv[1] ?? "", process.execPath),
		"npxIsolated",
		issues,
	);

	// Blocking if any of the required peers or project context is missing
	const blocking = issues.some(
		(c) =>
			c === "missingTypescript" ||
			c === "missingBiome" ||
			c === "noPackageJson",
	);
	return { ok: !blocking, issues };
}

// CHANGE: Helper to print blocking issues (missing peers, no package.json)
// WHY: Reduce size/complexity of printPreflightReport by delegating detailed output
// QUOTE(LINT): "Function has too many lines (max 50)"
// REF: ESLint max-lines-per-function
/**
 * Print detailed guidance for the "noPackageJson" blocking issue.
 *
 * Invariant: Users should execute the CLI from a directory containing package.json
 */
// CHANGE: extract small printer to reduce lines in dispatcher
// WHY: satisfy max-lines-per-function without losing clarity
// QUOTE(LINT): "Function has too many lines (max 50)"
// REF: ESLint max-lines-per-function
function printNoPackageJson(): void {
	console.error("  • Current directory does not contain package.json.");
	console.error(
		"    Why: vibecode-linter resolves peer tools (TypeScript, Biome) from your project.",
	);
	console.error(
		"    Action: Run this command from your project root (where package.json is located).\n",
	);
}

/**
 * Print detailed guidance for the "missingTypescript" blocking issue.
 *
 * Invariant: TypeScript must be installed in the consumer project
 */
// CHANGE: extract small printer to reduce lines in dispatcher
// WHY: satisfy max-lines-per-function without losing clarity
// QUOTE(LINT): "Function has too many lines (max 50)"
// REF: ESLint max-lines-per-function
function printMissingTypescript(): void {
	console.error(
		"  • TypeScript (typescript) is not installed in this project.",
	);
	console.error(
		"    Why: vibecode-linter uses your project's TypeScript as a peer dependency.",
	);
	console.error("    Install:");
	console.error("      npm install --save-dev typescript");
	console.error("    Verify:");
	console.error("      npx tsc --version\n");
}

/**
 * Print detailed guidance for the "missingBiome" blocking issue.
 *
 * Invariant: Biome CLI must be installed in the consumer project
 */
// CHANGE: extract small printer to reduce lines in dispatcher
// WHY: satisfy max-lines-per-function without losing clarity
// QUOTE(LINT): "Function has too many lines (max 50)"
// REF: ESLint max-lines-per-function
function printMissingBiome(): void {
	console.error(
		"  • Biome CLI (@biomejs/biome) is not installed in this project.",
	);
	console.error(
		"    Why: vibecode-linter runs Biome as an external tool from your node_modules.",
	);
	console.error("    Install:");
	console.error("      npm install --save-dev @biomejs/biome");
	console.error("    Verify:");
	console.error("      npx biome --version\n");
}

/**
 * Print blocking issues dispatcher.
 *
 * CHANGE: delegate per-issue printing to compact helpers
 * WHY: keep this function small to satisfy linting constraints
 * QUOTE(LINT): "Function has too many lines (max 50)"
 * REF: ESLint max-lines-per-function
 */
function printBlockingIssues(
	blockingIssues: ReadonlyArray<PreflightIssueCode>,
): void {
	console.error(
		"\n[ERROR] Environment preflight failed. Please resolve the following issues:\n",
	);
	for (const issue of blockingIssues) {
		switch (issue) {
			case "noPackageJson": {
				printNoPackageJson();
				break;
			}
			case "missingTypescript": {
				printMissingTypescript();
				break;
			}
			case "missingBiome": {
				printMissingBiome();
				break;
			}
			case "npxIsolated": {
				// Advisory-only: handled as warning elsewhere; not a blocker
				break;
			}
			default: {
				// Unreachable/placeholder for exhaustiveness
				break;
			}
		}
	}
}

// CHANGE: Helper to print advisory warnings (non-blocking hints)
// WHY: Keep printPreflightReport concise
// QUOTE(LINT): "Function has too many lines (max 50)"
// REF: ESLint max-lines-per-function
function printAdvisoryWarnings(
	advisories: ReadonlyArray<PreflightIssueCode>,
): void {
	if (advisories.length === 0) return;
	// Currently the only advisory is npxIsolated
	if (advisories.includes("npxIsolated")) {
		console.warn("\n[WARN] Detected isolated npx execution environment.");
		console.warn(
			"       Running via a fresh npx cache may not see your project's devDependencies.",
		);
		console.warn("       Recommended:");
		console.warn(
			"         npm install --save-dev @ton-ai-core/vibecode-linter",
		);
		console.warn("         npx @ton-ai-core/vibecode-linter <path>\n");
	}
}

/**
 * Print actionable, English guidance based on preflight issues.
 *
 * No side-effects other than stdout/stderr. Does not exit the process.
 */
export function printPreflightReport(
	issues: ReadonlyArray<PreflightIssueCode>,
): void {
	// CHANGE: Keep this function concise by delegating detailed output to helpers
	// WHY: Satisfy max-lines-per-function while preserving actionable guidance
	// QUOTE(LINT): "Function has too many lines (max 50)"
	// REF: ESLint max-lines-per-function
	if (issues.length === 0) return;

	const blockingIssues = issues.filter((c) => c !== "npxIsolated");
	const advisories = issues.filter((c) => c === "npxIsolated");

	if (blockingIssues.length > 0) {
		printBlockingIssues(blockingIssues);
	}
	printAdvisoryWarnings(advisories);
}

/**
 * Convenience helper to both run and print preflight diagnostics.
 *
 * @returns PreflightResult for the caller to decide whether to proceed or exit.
 */
export function checkAndReportPreflight(
	cwd: string = process.cwd(),
): PreflightResult {
	const result = runPreflight(cwd);
	printPreflightReport(result.issues);
	return result;
}

// CHANGE: This module is designed to be used by the CLI entry before any linter execution.
// WHY: Enforce invariants early to prevent runtime MODULE_NOT_FOUND and provide clear guidance.
// QUOTE(ТЗ): "Любое решение строится на инвариантах и проверяемых источниках"
// REF: CLINE-RULES
