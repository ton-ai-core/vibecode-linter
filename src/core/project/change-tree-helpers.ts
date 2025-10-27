// CHANGE: Shared helpers for git-aware change tree formatting
// WHY: Keep main formatter lean (<300 LOC) while preserving pure, testable helpers
// QUOTE(ТЗ): "Разбить ... каждый файл желательно < 300 строк"
// REF: user-request-project-info-tree
// FORMAT THEOREM: All helpers are pure functions operating on immutable inputs
// PURITY: CORE
// INVARIANT: No IO; deterministic transformations only
// COMPLEXITY: Documented per function below

import type {
	FileChangeInfo,
	ProjectTreeDirectory,
	ProjectTreeFile,
} from "../types/index.js";

export interface DirectorySummary {
	readonly modifiedFiles: number;
	readonly untrackedFiles: number;
	readonly additions: number;
	readonly deletions: number;
}

interface FileRenderNode {
	readonly name: string;
	readonly relativePath: string;
}

interface DirectoryRenderNode {
	readonly name: string;
	readonly relativePath: string;
	readonly directories: Map<string, DirectoryRenderNode>;
	readonly files: Map<string, FileRenderNode>;
}

export interface RenderContext {
	readonly summaryMap: ReadonlyMap<string, DirectorySummary>;
	readonly changeMap: ReadonlyMap<string, FileChangeInfo>;
	readonly lines: string[];
	readonly inlineLimit: number;
}

export const DEFAULT_INLINE_LIMIT = 5;

const ROOT_RELATIVE_PATH = "";
const SLASH = "/";
const ELLIPSIS = "…";

function normalizeRelativePath(relativePath: string): string {
	return relativePath === "." ? ROOT_RELATIVE_PATH : relativePath;
}

function createDirectoryNode(
	name: string,
	relativePath: string,
): DirectoryRenderNode {
	return {
		name,
		relativePath,
		directories: new Map(),
		files: new Map(),
	};
}

function insertSnapshotFile(
	file: ProjectTreeFile,
	target: DirectoryRenderNode,
): void {
	const normalized = normalizeRelativePath(file.relativePath);
	target.files.set(file.name, {
		name: file.name,
		relativePath: normalized,
	});
}

function insertSnapshotDirectory(
	source: ProjectTreeDirectory,
	target: DirectoryRenderNode,
): void {
	for (const entry of source.entries) {
		if (entry.kind === "directory") {
			const normalized = normalizeRelativePath(entry.relativePath);
			const child = createDirectoryNode(entry.name, normalized);
			target.directories.set(entry.name, child);
			insertSnapshotDirectory(entry, child);
		} else {
			insertSnapshotFile(entry, target);
		}
	}
}

function ensureDirectoryForPath(
	root: DirectoryRenderNode,
	segments: readonly string[],
): DirectoryRenderNode {
	let current = root;
	for (const segment of segments) {
		let child = current.directories.get(segment);
		if (child === undefined) {
			const relativePath =
				current.relativePath.length === 0
					? segment
					: `${current.relativePath}${SLASH}${segment}`;
			child = createDirectoryNode(segment, relativePath);
			current.directories.set(segment, child);
		}
		current = child;
	}
	return current;
}

function ensureFileNode(root: DirectoryRenderNode, relativePath: string): void {
	const segments = relativePath
		.split(SLASH)
		.filter((segment) => segment.length > 0);
	const fileName = segments.pop();
	if (fileName === undefined) return;
	const parent = ensureDirectoryForPath(root, segments);
	if (!parent.files.has(fileName)) {
		const parentPath = parent.relativePath;
		const fileRelativePath =
			parentPath.length === 0 ? fileName : `${parentPath}${SLASH}${fileName}`;
		parent.files.set(fileName, {
			name: fileName,
			relativePath: fileRelativePath,
		});
	}
}

export function buildDirectoryTree(
	root: ProjectTreeDirectory,
	changeMap: ReadonlyMap<string, FileChangeInfo>,
): DirectoryRenderNode {
	const rootNode = createDirectoryNode(root.name, ROOT_RELATIVE_PATH);
	insertSnapshotDirectory(root, rootNode);
	for (const [key, info] of changeMap.entries()) {
		if (info.isDirectory) continue;
		if (key.length === 0) continue;
		ensureFileNode(rootNode, key);
	}
	return rootNode;
}

interface Totals {
	modified: number;
	untracked: number;
	additions: number;
	deletions: number;
}

const ZERO_TOTALS: Totals = {
	modified: 0,
	untracked: 0,
	additions: 0,
	deletions: 0,
};

function cloneTotals(totals: Totals): Totals {
	return {
		modified: totals.modified,
		untracked: totals.untracked,
		additions: totals.additions,
		deletions: totals.deletions,
	};
}

function applyFileChange(change: FileChangeInfo, totals: Totals): void {
	if (change.category === "untracked") {
		totals.untracked += 1;
		return;
	}
	totals.modified += 1;
	totals.additions += change.additions;
	totals.deletions += change.deletions;
}

export function aggregateDirectorySummaries(
	node: DirectoryRenderNode,
	changeMap: ReadonlyMap<string, FileChangeInfo>,
	summaryMap: Map<string, DirectorySummary>,
): DirectorySummary {
	const totals = cloneTotals(ZERO_TOTALS);

	for (const file of node.files.values()) {
		const change = changeMap.get(file.relativePath);
		if (change === undefined || change.isDirectory) continue;
		applyFileChange(change, totals);
	}

	for (const child of node.directories.values()) {
		const childSummary = aggregateDirectorySummaries(
			child,
			changeMap,
			summaryMap,
		);
		totals.modified += childSummary.modifiedFiles;
		totals.untracked += childSummary.untrackedFiles;
		totals.additions += childSummary.additions;
		totals.deletions += childSummary.deletions;
	}

	const directoryChange = changeMap.get(node.relativePath);
	if (directoryChange?.isDirectory === true) {
		applyFileChange(directoryChange, totals);
	}

	const summary: DirectorySummary = {
		modifiedFiles: totals.modified,
		untrackedFiles: totals.untracked,
		additions: totals.additions,
		deletions: totals.deletions,
	};
	summaryMap.set(node.relativePath, summary);
	return summary;
}

export function formatInlineFiles(
	files: ReadonlyMap<string, FileRenderNode>,
	changeMap: ReadonlyMap<string, FileChangeInfo>,
	inlineLimit: number,
): string {
	if (files.size === 0) return "";
	const entries: string[] = [];
	const sorted = [...files.values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const file of sorted) {
		const rendered = formatFileEntry(file, changeMap.get(file.relativePath));
		if (rendered !== null) {
			entries.push(rendered);
		}
	}
	if (entries.length > inlineLimit) {
		return [...entries.slice(0, inlineLimit), ELLIPSIS].join(", ");
	}
	return entries.join(", ");
}

function formatFileEntry(
	file: FileRenderNode,
	change: FileChangeInfo | undefined,
): string | null {
	if (change === undefined) {
		return file.name;
	}
	if (change.isDirectory) {
		return null;
	}
	const diff =
		change.category === "untracked"
			? null
			: `(+${change.additions}/-${change.deletions})`;
	const label =
		change.statusLabel === "??"
			? `?? ${file.name}`
			: `${change.statusLabel} ${file.name}`;
	return diff === null ? label : `${label} ${diff}`;
}

export function composeLine(
	nameColumn: string,
	summaryText: string,
	inlineText: string,
): string {
	const segments: string[] = [nameColumn.trimEnd()];
	if (summaryText.length > 0) segments.push(summaryText);
	if (inlineText.length > 0) segments.push(inlineText);
	return segments.join("  ");
}

export function renderDirectory(
	node: DirectoryRenderNode,
	prefix: string,
	context: RenderContext,
): void {
	const { summaryMap, changeMap, lines, inlineLimit } = context;
	const sortedChildren = [...node.directories.values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	sortedChildren.forEach((child, index) => {
		const isLast = index === sortedChildren.length - 1;
		const connector = isLast ? "└─" : "├─";
		const childPrefix = `${prefix}${isLast ? "   " : "│  "}`;
		const summary = summaryMap.get(child.relativePath);
		const summaryText =
			summary === undefined ? "" : formatDirectorySummary(summary);
		const inlineText = formatInlineFiles(child.files, changeMap, inlineLimit);
		const base = `${prefix}${connector} ${child.name}${SLASH}`;
		lines.push(composeLine(base, summaryText, inlineText));
		renderDirectory(child, childPrefix, context);
	});
}

export function formatDirectorySummary(summary: DirectorySummary): string {
	const tokens: string[] = [];
	if (summary.modifiedFiles > 0) tokens.push(`M${summary.modifiedFiles}`);
	if (summary.additions > 0 || summary.deletions > 0) {
		tokens.push(`+${summary.additions}/-${summary.deletions}`);
	}
	if (summary.untrackedFiles > 0) tokens.push(`?${summary.untrackedFiles}`);
	return tokens.length > 0 ? `[${tokens.join(" ")}]` : "";
}
