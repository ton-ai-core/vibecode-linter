// CHANGE: Shell collector for filesystem metrics
// WHY: Separate IO-bound traversal from pure metrics logic
// QUOTE(ТЗ): "SHELL → CORE, но не наоборот"
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: collect(target) ⇒ records mapped to CORE snapshot builder
// PURITY: SHELL
// EFFECT: Effect<ReadonlyArray<ProjectFileRecord>, never>
// INVARIANT: Skips forbidden directories; never throws upstream
// COMPLEXITY: O(n) where n = файлов в целевой директории

import { Effect } from "effect";

import { deriveFileContentMetrics } from "../../core/project/metrics.js";
import type { ProjectFileRecord } from "../../core/types/index.js";
import { fs, path } from "../utils/node-mods.js";

const fsPromises = fs.promises;

const IGNORED_DIRECTORIES = new Set([
	".git",
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".next",
	"build",
	"out",
]);

type ErrorLike =
	| Error
	| string
	| number
	| boolean
	| bigint
	| symbol
	| null
	| undefined
	| readonly ErrorLike[]
	| { readonly [key: string]: ErrorLike };

function stringifyStructured(value: ErrorLike): string {
	try {
		const json = JSON.stringify(value);
		if (typeof json === "string" && json.length > 0) {
			return json;
		}
	} catch {
		return Object.prototype.toString.call(value);
	}
	return Object.prototype.toString.call(value);
}

function isErrorWithMessage(value: ErrorLike): value is Error {
	return value instanceof Error && value.message.length > 0;
}

function isNonEmptyString(value: ErrorLike): value is string {
	return typeof value === "string" && value.length > 0;
}

function isBooleanOrNumber(value: ErrorLike): value is number | boolean {
	return typeof value === "number" || typeof value === "boolean";
}

function isBigintOrSymbol(value: ErrorLike): value is bigint | symbol {
	return typeof value === "bigint" || typeof value === "symbol";
}

function isNullish(value: ErrorLike): value is null | undefined {
	return value == null;
}

function isPlainRecord(
	value: ErrorLike,
): value is { readonly [key: string]: ErrorLike } {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof Error)
	);
}

/**
 * CHANGE: Normalize error-like values to human-readable strings.
 * WHY: Cannot rely on `unknown`; enforce explicit structural type.
 * QUOTE(ТЗ): "Строгая типизация"
 * REF: user-request-project-info
 * FORMAT THEOREM: errorMessage(e) ∈ string
 * PURITY: CORE helper
 * INVARIANT: Non-throwing for any input
 * COMPLEXITY: O(1)
 */
function errorMessage(value: ErrorLike): string {
	if (isErrorWithMessage(value)) {
		return value.message;
	}
	if (isNonEmptyString(value)) {
		return value;
	}
	if (isBooleanOrNumber(value)) {
		return `${value}`;
	}
	if (isBigintOrSymbol(value)) {
		return value.toString();
	}
	if (isNullish(value)) {
		return String(value);
	}
	if (Array.isArray(value)) {
		return stringifyStructured(value);
	}
	if (isPlainRecord(value)) {
		return stringifyStructured(value);
	}
	return "unknown error";
}

/**
 * CHANGE: Normalize relative path inside target root.
 * WHY: Collector should always emit POSIX separators for CORE.
 * QUOTE(ТЗ): "Математические инварианты" — один путь = одно представление.
 * REF: user-request-project-info
 * FORMAT THEOREM: relative("", name) = name; relative(a,b) = `${a}/${b}`
 * PURITY: CORE (helper used by SHELL)
 * INVARIANT: Never starts/ends с "/"
 * COMPLEXITY: O(1)
 */
function joinRelative(base: string, name: string): string {
	if (base.length === 0) return name;
	return `${base}/${name}`;
}

/**
 * CHANGE: Build ProjectFileRecord from absolute path.
 * WHY: Keep IO confined while delegating metrics to CORE.
 * QUOTE(ТЗ): "Functional Core, Imperative Shell"
 * REF: user-request-project-info
 * FORMAT THEOREM: record.metrics = deriveFileContentMetrics(content, ext)
 * PURITY: SHELL
 * EFFECT: Effect<ProjectFileRecord | null, never>
 * INVARIANT: Returns null when file reading fails
 * COMPLEXITY: O(n) for reading file
 */
async function createFileRecord(
	absolutePath: string,
	relativePath: string,
): Promise<ProjectFileRecord | null> {
	try {
		const stats = await fsPromises.stat(absolutePath);
		if (!stats.isFile()) {
			return null;
		}
		const buffer = await fsPromises.readFile(absolutePath, "utf8");
		const extension = path.extname(absolutePath).toLowerCase();
		return {
			relativePath,
			sizeBytes: stats.size,
			extension,
			metrics: deriveFileContentMetrics(buffer, extension),
		};
	} catch (error) {
		const formatted = error instanceof Error ? error : String(error);
		console.warn(`⚠️  Skipped ${relativePath} (${errorMessage(formatted)})`);
		return null;
	}
}

/**
 * CHANGE: Recursively traverse directories with ignore set.
 * WHY: Need deterministic ordering + ability to skip heavy dirs (node_modules, dist, ...)
 * QUOTE(ТЗ): "CORE никогда не вызывает SHELL"
 * REF: user-request-project-info
 * FORMAT THEOREM: walk(dir) returns Σ child records
 * PURITY: SHELL
 * EFFECT: Effect<ReadonlyArray<ProjectFileRecord>, never>
 * INVARIANT: Dir entries sorted lexicographically
 * COMPLEXITY: O(n)
 */
async function walkDirectory(
	absoluteDir: string,
	relativeBase: string,
): Promise<readonly ProjectFileRecord[]> {
	const dirents = await fsPromises.readdir(absoluteDir, {
		withFileTypes: true,
	});
	const records: ProjectFileRecord[] = [];
	const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name));

	for (const dirent of sorted) {
		const name = dirent.name;
		const relativePath = joinRelative(relativeBase, name);
		const absolutePath = path.join(absoluteDir, name);
		if (dirent.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(name)) {
				continue;
			}
			const nested = await walkDirectory(absolutePath, relativePath);
			records.push(...nested);
			continue;
		}
		if (dirent.isFile()) {
			const record = await createFileRecord(absolutePath, relativePath);
			if (record !== null) {
				records.push(record);
			}
		}
	}

	return records;
}

/**
 * CHANGE: Collect ProjectFileRecord array under Effect discipline.
 * WHY: Expose safe API for runLinter without throwing.
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: collectEffect(target).success ⇒ Promise resolves with records
 * PURITY: SHELL
 * EFFECT: Effect<ReadonlyArray<ProjectFileRecord>, never>
 * INVARIANT: Returns [] при ошибках доступа
 * COMPLEXITY: O(n)
 */
export function collectProjectFilesEffect(
	targetPath: string,
): Effect.Effect<readonly ProjectFileRecord[], never> {
	return Effect.tryPromise(async () => {
		const absoluteTarget = path.resolve(process.cwd(), targetPath);
		try {
			const stats = await fsPromises.stat(absoluteTarget);
			if (stats.isFile()) {
				const single = await createFileRecord(
					absoluteTarget,
					path.basename(absoluteTarget),
				);
				return single === null ? [] : [single];
			}
			if (stats.isDirectory()) {
				return await walkDirectory(absoluteTarget, "");
			}
			console.warn(`⚠️  Target ${targetPath} is neither file nor directory.`);
			return [];
		} catch (error) {
			const formatted = error instanceof Error ? error : String(error);
			console.warn(
				`⚠️  Unable to read ${targetPath}: ${errorMessage(formatted)}`,
			);
			return [];
		}
	}).pipe(
		Effect.catchAll(() => Effect.succeed<readonly ProjectFileRecord[]>([])),
	);
}
