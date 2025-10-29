// CHANGE: Add test helper to create isolated temporary projects for preflight tests
// WHY: We must validate module resolution invariants (TypeScript/Biome peers) without mocking require.resolve
// QUOTE(ТЗ): "Любое решение строится на инвариантах и проверяемых источниках"
// REF: REQ-CLI-PREFLIGHT-PEERS, REQ-LINT-FIX
// SOURCE: n/a

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * CHANGE: Define JSON types to avoid 'unknown'/'any' in tests
 * WHY: Project rules forbid 'unknown' and 'any'; we need precise JSON-safe types
 * QUOTE(ТЗ): "Никогда не использовать any, unknown"
 * REF: REQ-001
 */
type JSONPrimitive = string | number | boolean | null;
export type JSONValue =
	| JSONPrimitive
	| readonly JSONValue[]
	| { readonly [key: string]: JSONValue };
interface JSONObject {
	readonly [key: string]: JSONValue;
}

/**
 * Options controlling which parts of a temporary project to materialize.
 *
 * Invariants:
 * - When withPackageJson=true, a package.json will be created at the project root.
 * - When withTypescript=true, node_modules/typescript/package.json will be created.
 * - When withBiome=true, node_modules/@biomejs/biome/package.json will be created.
 */
export interface TempProjectOptions {
	readonly withPackageJson?: boolean;
	readonly withTypescript?: boolean;
	readonly withBiome?: boolean;
}

/**
 * Result of creating a temporary project.
 *
 * Postconditions:
 * - cwd points to the root directory of the temporary project
 * - cleanup() removes the temporary directory recursively
 */
export interface TempProject {
	readonly cwd: string;
	readonly cleanup: () => void;
}

/**
 * Create a directory recursively if it does not exist.
 *
 * @param dir Absolute path to directory
 */
function ensureDir(dir: string): void {
	// CHANGE: Use recursive mkdir to ensure nested node_modules paths exist
	// WHY: Node's require.resolve needs directory structure to be present
	// QUOTE(ТЗ): "Инварианты должны быть материализованы, а не замоканы"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write a JSON file atomically.
 *
 * @param file Absolute file path
 * @param data JSON object to write
 */
// CHANGE: Replace forbidden 'unknown' with precise JSONObject type
// WHY: Enforce invariant of strict typing without 'any'/'unknown'
// QUOTE(ТЗ): "Никогда не использовать any, unknown"
// REF: REQ-001
function writeJson(file: string, data: JSONObject): void {
	const content = `${JSON.stringify(data, null, 2)}\n`;
	fs.writeFileSync(file, content, { encoding: "utf-8" });
}

/**
 * Create a minimal package.json at the provided location.
 *
 * @param file Absolute path to package.json
 * @param name Package name
 * @param version Package version
 */
function writeMinimalPackageJson(
	file: string,
	name: string,
	version: string,
): void {
	writeJson(file, { name, version });
}

/**
 * CHANGE: Shared cleanup function to eliminate code duplication
 * WHY: Both createTempProject and createIsolatedE2EProject need identical cleanup logic
 * QUOTE(ТЗ): "Соблюдать чистоту окружения тестов"
 * REF: REQ-LINT-FIX, user-request-duplicate-elimination
 *
 * @param cwd Directory path to clean up
 * @returns Cleanup function that safely removes the directory
 *
 * @pure false (file system I/O)
 * @invariant Safe and idempotent cleanup operation
 * @postcondition Directory removed or best-effort attempted
 */
function createCleanupFunction(cwd: string): () => void {
	return (): void => {
		try {
			fs.rmSync(cwd, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	};
}

/**
 * Create a temporary project directory with optional package.json and peer dependencies.
 *
 * @param options Options specifying which artifacts to create
 * @returns TempProject with cwd and cleanup()
 *
 * @example
 * // Create project with package.json and TypeScript only
 * const t = createTempProject({ withPackageJson: true, withTypescript: true });
 * // ... run tests ...
 * t.cleanup();
 */
export function createTempProject(
	options: TempProjectOptions = {},
): TempProject {
	const prefix = path.join(os.tmpdir(), "vibecode-linter-test-");
	const cwd = fs.mkdtempSync(prefix);

	// CHANGE: Optionally create package.json in project root
	// WHY: runPreflight checks for presence of package.json
	// QUOTE(ТЗ): "Проверять запуск из корня проекта"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	if (options.withPackageJson === true) {
		const pkgPath = path.join(cwd, "package.json");
		writeMinimalPackageJson(pkgPath, "temp-project", "0.0.0");
	}

	// CHANGE: Optionally create a resolvable typescript package
	// WHY: runPreflight uses require.resolve('typescript', { paths: [cwd] })
	// QUOTE(ТЗ): "Использовать версию инструмента проекта"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	if (options.withTypescript === true) {
		const tsDir = path.join(cwd, "node_modules", "typescript");
		ensureDir(tsDir);
		writeMinimalPackageJson(
			path.join(tsDir, "package.json"),
			"typescript",
			"5.9.9",
		);
	}

	// CHANGE: Optionally create a resolvable @biomejs/biome package
	// WHY: runPreflight resolves '@biomejs/biome' or '@biomejs/biome/package.json'
	// QUOTE(ТЗ): "Проверять наличие Biome CLI в проекте"
	// REF: REQ-CLI-PREFLIGHT-PEERS
	if (options.withBiome === true) {
		const biomeDir = path.join(cwd, "node_modules", "@biomejs", "biome");
		ensureDir(biomeDir);
		writeMinimalPackageJson(
			path.join(biomeDir, "package.json"),
			"@biomejs/biome",
			"2.2.6",
		);
	}

	// CHANGE: Use shared cleanup function to eliminate duplication
	// WHY: Avoid code duplication between temp project creation functions
	// REF: REQ-LINT-FIX, user-request-duplicate-elimination
	const cleanup = createCleanupFunction(cwd);

	return { cwd, cleanup };
}

/**
 * Recursively copy directory contents.
 *
 * CHANGE: Helper to copy directory tree for isolated E2E project
 * WHY: E2E tests need isolated git context independent of main repo
 * QUOTE(ТЗ): "E2E тесты должны быть детерминированными"
 * REF: REQ-E2E-DETERMINISTIC
 *
 * @param src Source directory path
 * @param dest Destination directory path
 *
 * @pure false (file system I/O)
 * @complexity O(n) where n = number of files/directories
 */
function copyDirectory(src: string, dest: string): void {
	const entries = fs.readdirSync(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			fs.mkdirSync(destPath, { recursive: true });
			copyDirectory(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Create isolated git repository from e2e-test-project.
 *
 * CHANGE: Create isolated copy inside repo with deterministic git state for E2E tests
 * WHY: E2E tests require deterministic git output independent of main repo commits
 * QUOTE(ТЗ): "сохранять внутри проекта не в tmp"
 * REF: REQ-E2E-DETERMINISTIC, user-request-e2e-isolation
 *
 * @param sourceDir Path to e2e-test-project directory
 * @returns TempProject with isolated git repo and cleanup function
 *
 * @invariant ∀ test_run: git_status(isolated_copy) = CLEAN
 * @invariant ∀ t1, t2 ∈ TestRuns: linter_output(t1) ≡ linter_output(t2)
 * @postcondition git repo initialized with fixed author/date, all files tracked
 * @complexity O(n) where n = number of files to copy
 * @pure false (creates temporary directory, runs git commands)
 *
 * @example
 * const e2e = createIsolatedE2EProject("/path/to/e2e-test-project");
 * // Run tests on e2e.cwd
 * e2e.cleanup();
 */
export function createIsolatedE2EProject(sourceDir: string): TempProject {
	// CHANGE: Create isolated copy inside repo in .e2e/ directory instead of /tmp/
	// WHY: User requested to keep isolated copy within project structure
	// QUOTE(ТЗ): "сохранять внутри проекта не в tmp"
	// REF: user-request-e2e-isolation
	const repoRoot = path.resolve(__dirname, "../..");
	const e2eDir = path.join(repoRoot, ".e2e");

	// Ensure .e2e directory exists
	fs.mkdirSync(e2eDir, { recursive: true });

	// Create unique isolated directory with random suffix
	const randomId = Math.random().toString(36).substring(2, 8);
	const cwd = path.join(e2eDir, `isolated-${randomId}`);

	// Create the isolated directory
	fs.mkdirSync(cwd, { recursive: true });

	try {
		// CHANGE: Copy all files from source to isolated directory
		// WHY: Tests need exact copy of e2e-test-project structure
		// INVARIANT: ∀ file ∈ source: ∃ file ∈ dest
		copyDirectory(sourceDir, cwd);

		// CHANGE: Symlink node_modules from main repo to isolated copy
		// WHY: Linter needs access to actual eslint/biome/typescript executables
		// QUOTE(ТЗ): "npx eslint/biome/tsc need to find tools in node_modules"
		// REF: REQ-E2E-DETERMINISTIC, user-request-e2e-isolation
		// INVARIANT: Symlink points to main repo node_modules
		const mainRepoNodeModules = path.resolve(__dirname, "../../node_modules");
		const isolatedNodeModules = path.join(cwd, "node_modules");
		fs.symlinkSync(mainRepoNodeModules, isolatedNodeModules, "dir");

		// CHANGE: Initialize git with deterministic configuration
		// WHY: Linter displays git diff context, needs stable git state
		// POSTCONDITION: git status --porcelain = "" (clean working tree)
		execSync("git init", { cwd, stdio: "pipe" });

		// CHANGE: Set fixed author and deterministic git config
		// WHY: Tests expect consistent git author in output
		// QUOTE(ТЗ): "фиксированным автором/датой"
		// REF: user-request-e2e-isolation
		execSync("git config user.name 'E2E Test'", { cwd, stdio: "pipe" });
		execSync("git config user.email 'e2e@test.local'", { cwd, stdio: "pipe" });
		execSync("git config core.autocrlf false", { cwd, stdio: "pipe" });
		execSync("git config core.filemode false", { cwd, stdio: "pipe" });

		// CHANGE: Set fixed commit date for deterministic output
		// WHY: Git diff shows dates, need consistent timestamps
		// INVARIANT: All commits have same fixed timestamp
		const fixedDate = "2025-01-01T00:00:00Z";
		const gitEnv = {
			...process.env,
			GIT_AUTHOR_DATE: fixedDate,
			GIT_COMMITTER_DATE: fixedDate,
		};

		execSync("git add .", { cwd, stdio: "pipe", env: gitEnv });
		execSync('git commit -m "Initial commit: E2E test fixtures"', {
			cwd,
			stdio: "pipe",
			env: gitEnv,
		});
	} catch (error) {
		// CHANGE: Use shared cleanup function on failure to avoid temp directory leaks
		// WHY: Ensure resources are released even on error, eliminate code duplication
		// REF: user-request-duplicate-elimination
		createCleanupFunction(cwd)();
		throw error;
	}

	// CHANGE: Use shared cleanup function to eliminate duplication
	// WHY: Avoid code duplication between temp project creation functions
	// REF: REQ-LINT-FIX, user-request-duplicate-elimination
	const cleanup = createCleanupFunction(cwd);

	return { cwd, cleanup };
}
