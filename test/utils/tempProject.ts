// CHANGE: Add test helper to create isolated temporary projects for preflight tests
// WHY: We must validate module resolution invariants (TypeScript/Biome peers) without mocking require.resolve
// QUOTE(ТЗ): "Любое решение строится на инвариантах и проверяемых источниках"
// REF: REQ-CLI-PREFLIGHT-PEERS, REQ-LINT-FIX
// SOURCE: n/a

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

	// CHANGE: Provide cleanup that is safe and idempotent
	// WHY: Avoid leaving temporary files on CI/Dev environments
	// QUOTE(ТЗ): "Соблюдать чистоту окружения тестов"
	// REF: REQ-LINT-FIX
	const cleanup = (): void => {
		try {
			fs.rmSync(cwd, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	};

	return { cwd, cleanup };
}
