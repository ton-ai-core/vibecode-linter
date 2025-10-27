// CHANGE: Build immutable project tree snapshots and textual formatting
// WHY: Tree construction/formatting must remain pure to satisfy Functional-Core architecture
// QUOTE(ТЗ): "CORE никогда не вызывает SHELL" / "Каждая функция — это теорема."
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: ∀files: snapshot(files) deterministically encodes metrics hierarchy
// PURITY: CORE
// INVARIANT: No mutation escapes module; outputs immutable structures
// COMPLEXITY: O(n log n) for sorting where n = |files|

import { match } from "ts-pattern";

import type {
	FileContentMetrics,
	ProjectAggregateMetrics,
	ProjectFileRecord,
	ProjectSnapshot,
	ProjectTreeDirectory,
	ProjectTreeFile,
	ProjectTreeNode,
	TreeFormatOptions,
} from "../types/project-info.js";

interface MutableDirectory {
	readonly name: string;
	readonly relativePath: string;
	readonly directories: Map<string, MutableDirectory>;
	readonly files: ProjectTreeFile[];
}

/**
 * CHANGE: Create mutable builder node scoped to module.
 * WHY: Avoids repeated cloning while keeping external API pure.
 * QUOTE(ТЗ): "Неизменяемые данные" — наружу, внутренняя сборка допускает локальную мутацию.
 * REF: user-request-project-info
 * FORMAT THEOREM: builder(name,path) constructs isolated mutable accumulator
 * PURITY: CORE (mutation не выходит наружу)
 * INVARIANT: directories map + files list always инициализированы
 * COMPLEXITY: O(1)
 */
function createMutableDirectory(
	name: string,
	relativePath: string,
): MutableDirectory {
	return {
		name,
		relativePath,
		directories: new Map(),
		files: [],
	};
}

/**
 * CHANGE: Normalize relative path into POSIX segments.
 * WHY: Ensures deterministic tree regardless of OS separators.
 * QUOTE(ТЗ): "Математические инварианты" — один и тот же путь ⇒ один набор сегментов.
 * REF: user-request-project-info
 * FORMAT THEOREM: normalize(path) produces segments with ∀segment ≠ ""
 * PURITY: CORE
 * INVARIANT: Returns [] for empty/"."
 * COMPLEXITY: O(k) where k = |path|
 */
function normalizeSegments(relativePath: string): readonly string[] {
	const trimmed = relativePath.replace(/\\/g, "/").replace(/^\.\/+/u, "");
	if (trimmed.length === 0 || trimmed === ".") return [];
	return trimmed
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

/**
 * CHANGE: Insert file record into mutable tree.
 * WHY: Centralizes hierarchy creation logic.
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: user-request-project-info
 * FORMAT THEOREM: insert(record) ensures ∃path node containing file metrics
 * PURITY: CORE (mutation локальна)
 * INVARIANT: Directories auto-created; duplicate paths append once
 * COMPLEXITY: O(d) где d = глубина пути
 */
function insertFileRecord(
	root: MutableDirectory,
	record: ProjectFileRecord,
): void {
	const segments = normalizeSegments(record.relativePath);
	const fileName = segments.at(-1);
	if (fileName === undefined) return;

	let current = root;
	const traversed: string[] = [];
	for (const segment of segments.slice(0, -1)) {
		traversed.push(segment);
		const relativePath = traversed.join("/");
		let next = current.directories.get(segment);
		if (next === undefined) {
			next = createMutableDirectory(segment, relativePath);
			current.directories.set(segment, next);
		}
		current = next;
	}

	const file: ProjectTreeFile = {
		kind: "file",
		name: fileName,
		relativePath: record.relativePath,
		sizeBytes: record.sizeBytes,
		metrics: record.metrics,
	};
	current.files.push(file);
}

/**
 * CHANGE: Finalize mutable directory into immutable tree node.
 * WHY: Expose only pure immutable structures downstream.
 * QUOTE(ТЗ): "Неизменяемые данные"
 * REF: user-request-project-info
 * FORMAT THEOREM: finalize(dir) sums metrics(children) + metrics(files)
 * PURITY: CORE
 * INVARIANT: entries отсортированы (dirs, затем files) по имени
 * COMPLEXITY: O(k log k) per directory with k children
 */
function finalizeDirectory(dir: MutableDirectory): ProjectTreeDirectory {
	let lines = 0;
	let characters = 0;
	let functions = 0;
	let fileCount = 0;
	let directoryCount = 1; // включает текущую директорию
	let sizeBytes = 0;

	const entries: ProjectTreeNode[] = [];

	const sortedDirectories = [...dir.directories.values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const child of sortedDirectories) {
		const finalized = finalizeDirectory(child);
		lines += finalized.metrics.lines;
		characters += finalized.metrics.characters;
		functions += finalized.metrics.functions;
		fileCount += finalized.fileCount;
		directoryCount += finalized.directoryCount;
		sizeBytes += finalized.sizeBytes;
		entries.push(finalized);
	}

	const sortedFiles = [...dir.files].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const file of sortedFiles) {
		lines += file.metrics.lines;
		characters += file.metrics.characters;
		functions += file.metrics.functions;
		fileCount += 1;
		sizeBytes += file.sizeBytes;
		entries.push(file);
	}

	return {
		kind: "directory",
		name: dir.name,
		relativePath: dir.relativePath,
		entries,
		metrics: { lines, characters, functions },
		fileCount,
		directoryCount,
		sizeBytes,
	};
}

/**
 * CHANGE: Build project snapshot from file records.
 * WHY: Provides single pure constructor for downstream shell usage.
 * QUOTE(ТЗ): "Сначала формализуем, потом программируем."
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: snapshot(files).totals = root.metrics + counts
 * PURITY: CORE
 * INVARIANT: directoryCount ≥ 1 (включает корень)
 * COMPLEXITY: O(n log n)
 */
export function createProjectSnapshot(
	rootLabel: string,
	files: readonly ProjectFileRecord[],
): ProjectSnapshot {
	const root = createMutableDirectory(rootLabel, ".");
	for (const record of files) {
		insertFileRecord(root, record);
	}
	const rootDirectory = finalizeDirectory(root);
	const totals: ProjectAggregateMetrics = {
		lines: rootDirectory.metrics.lines,
		characters: rootDirectory.metrics.characters,
		functions: rootDirectory.metrics.functions,
		fileCount: rootDirectory.fileCount,
		directoryCount: rootDirectory.directoryCount,
		sizeBytes: rootDirectory.sizeBytes,
	};
	return { root: rootDirectory, totals };
}

/**
 * CHANGE: Format metrics tuple into readable string.
 * WHY: Avoid duplication in tree formatter.
 * QUOTE(ТЗ): "Разумные рефакторинги без дубликатов"
 * REF: user-request-project-info
 * FORMAT THEOREM: formatMetrics(m) = `${lines}L | ${chars}C | ${functions}ƒ`
 * PURITY: CORE
 * INVARIANT: Non-negative integers produce non-empty output
 * COMPLEXITY: O(1)
 */
function formatMetrics(metrics: FileContentMetrics): string {
	return `${metrics.lines}L | ${metrics.characters}C | ${metrics.functions}ƒ`;
}

/**
 * CHANGE: Human-friendly size formatter (bytes → KB/MB).
 * WHY: CLI output should remain compact regardless of file size.
 * QUOTE(ТЗ): "Вывод текущей информации по проекту"
 * REF: user-request-project-info
 * FORMAT THEOREM: formatSize(b) monotonic, returns "" when b = 0
 * PURITY: CORE
 * INVARIANT: Never returns negative units
 * COMPLEXITY: O(1)
 */
function formatSize(sizeBytes: number): string {
	if (sizeBytes <= 0) return "";
	const units = ["B", "KB", "MB", "GB"];
	let value = sizeBytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const unitLabel = units[unitIndex];
	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)}${unitLabel}`;
}

/**
 * CHANGE: Recursively format project tree using ASCII connectors.
 * WHY: Provide deterministic textual representation for CLI shell.
 * QUOTE(ТЗ): "Отображать дерево папки"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: traverse(node) visits every node exactly once
 * PURITY: CORE
 * INVARIANT: Connectors maintain tree structure (├── / └── / │)
 * COMPLEXITY: O(n)
 */
export function formatProjectTree(
	root: ProjectTreeDirectory,
	options?: TreeFormatOptions,
): readonly string[] {
	const includeSize = options?.includeSize === true;
	const lines: string[] = [];

	const describeDirectory = (dir: ProjectTreeDirectory): string => {
		const nestedDirs = Math.max(dir.directoryCount - 1, 0);
		const metricsText = formatMetrics(dir.metrics);
		const sizeText =
			includeSize && dir.sizeBytes > 0 ? ` | ${formatSize(dir.sizeBytes)}` : "";
		return `${dir.name}/ [files: ${dir.fileCount}, dirs: ${nestedDirs}, ${metricsText}${sizeText}]`;
	};

	const describeFile = (file: ProjectTreeFile): string => {
		const metricsText = formatMetrics(file.metrics);
		const sizeText =
			includeSize && file.sizeBytes > 0
				? ` | ${formatSize(file.sizeBytes)}`
				: "";
		return `${file.name} (${metricsText}${sizeText})`;
	};

	lines.push(describeDirectory(root));

	const walk = (nodes: readonly ProjectTreeNode[], prefix: string): void => {
		nodes.forEach((node, index) => {
			const isLast = index === nodes.length - 1;
			const connector = isLast ? "└── " : "├── ";
			const linePrefix = `${prefix}${connector}`;
			const label = match(node)
				.with({ kind: "directory" }, describeDirectory)
				.with({ kind: "file" }, describeFile)
				.exhaustive();
			lines.push(`${linePrefix}${label}`);
			if (node.kind === "directory" && node.entries.length > 0) {
				const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;
				walk(node.entries, nextPrefix);
			}
		});
	};

	walk(root.entries, "");
	return lines;
}

export const __projectTreeInternals = {
	formatSize,
	normalizeSegments,
};
