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

/**
 * Extract error message from error value.
 *
 * CHANGE: Simple error message extraction with proper typing
 * WHY: Replace complex errorMessage function with simple implementation
 * QUOTE(ТЗ): "Математически доказуемые решения"
 * REF: Duplicate elimination
 *
 * @param error - Error value (Error or string)
 * @returns String representation of error
 * @pure true
 * @complexity O(1)
 */
function getErrorMessage(error: Error | string): string {
	if (error instanceof Error) {
		return error.message;
	}
	return error;
}

/**
 * Common error handler for file system operations.
 *
 * CHANGE: Extract common error handling pattern
 * WHY: DRY principle - identical pattern used in walkDirectory and collectProjectFiles
 * QUOTE(ТЗ): "Любое решение строится на математических инвариантах"
 * REF: Duplicate elimination - DUPLICATE #1, #2
 *
 * @param error - Error from file system operation
 * @param context - Context description for error message
 * @returns Effect that succeeds with empty array
 * @pure false (console.warn side effect)
 * @complexity O(1)
 */
function handleFileSystemError(
	error: Error | string,
	context: string,
): Effect.Effect<readonly ProjectFileRecord[]> {
	console.warn(`⚠️  Unable to read ${context}: ${getErrorMessage(error)}`);
	return Effect.succeed<readonly ProjectFileRecord[]>([]);
}

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
function createFileRecord(
	absolutePath: string,
	relativePath: string,
): Effect.Effect<ProjectFileRecord | null> {
	return Effect.tryPromise({
		try: () => fsPromises.stat(absolutePath),
		catch: (error) => error as Error,
	}).pipe(
		Effect.flatMap((stats) => {
			if (!stats.isFile()) {
				return Effect.succeed(null);
			}
			return Effect.tryPromise({
				try: () => fsPromises.readFile(absolutePath, "utf8"),
				catch: (error) => error as Error,
			}).pipe(
				Effect.map((buffer) => {
					const extension = path.extname(absolutePath).toLowerCase();
					return {
						relativePath,
						sizeBytes: stats.size,
						extension,
						metrics: deriveFileContentMetrics(buffer, extension),
					};
				}),
			);
		}),
		Effect.catchAll((error) => {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.warn(`⚠️  Skipped ${relativePath} (${errorMsg})`);
			return Effect.succeed(null);
		}),
	);
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
function walkDirectory(
	absoluteDir: string,
	relativeBase: string,
): Effect.Effect<readonly ProjectFileRecord[]> {
	return Effect.gen(function* (_) {
		const dirents = yield* _(
			Effect.tryPromise({
				try: () => fsPromises.readdir(absoluteDir, { withFileTypes: true }),
				catch: (error) => error as Error,
			}),
		);

		const records: ProjectFileRecord[] = [];
		const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name));

		for (const dirent of sorted) {
			const { name } = dirent;
			const relativePath = joinRelative(relativeBase, name);
			const absolutePath = path.join(absoluteDir, name);

			if (dirent.isDirectory()) {
				if (IGNORED_DIRECTORIES.has(name)) {
					continue;
				}
				const nested = yield* _(walkDirectory(absolutePath, relativePath));
				records.push(...nested);
				continue;
			}

			if (dirent.isFile()) {
				const record = yield* _(createFileRecord(absolutePath, relativePath));
				if (record !== null) {
					records.push(record);
				}
			}
		}

		return records;
	}).pipe(
		Effect.catchAll((error) => {
			const errorMsg = error instanceof Error ? error : String(error);
			return handleFileSystemError(errorMsg, `directory ${absoluteDir}`);
		}),
	);
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
): Effect.Effect<readonly ProjectFileRecord[]> {
	return Effect.gen(function* (_) {
		const absoluteTarget = path.resolve(process.cwd(), targetPath);

		const stats = yield* _(
			Effect.tryPromise({
				try: () => fsPromises.stat(absoluteTarget),
				catch: (error) => error as Error,
			}),
		);

		if (stats.isFile()) {
			const single = yield* _(
				createFileRecord(absoluteTarget, path.basename(absoluteTarget)),
			);
			return single === null ? [] : [single];
		}

		if (stats.isDirectory()) {
			return yield* _(walkDirectory(absoluteTarget, ""));
		}

		console.warn(`⚠️  Target ${targetPath} is neither file nor directory.`);
		return [];
	}).pipe(
		Effect.catchAll((error) => {
			const errorMsg = error instanceof Error ? error : String(error);
			return handleFileSystemError(errorMsg, targetPath);
		}),
	);
}
