// CHANGE: Public formatter entry point delegating to helpers
// WHY: Keep FCIS-compliant formatting surface concise while helpers live in change-tree-helpers
// QUOTE(USER): "Хочу сделать вот такаое отображение дерева..."
// REF: user-request-project-info-tree
// FORMAT THEOREM: formatChangeTree(root, map) deterministically renders git-aware directory tree
// PURITY: CORE
// INVARIANT: No IO; consumes immutable snapshot + change map
// COMPLEXITY: O(n log n) due to sorting within helpers

import type { FileChangeInfo, ProjectTreeDirectory } from "../types/index.js";
import {
	aggregateDirectorySummaries,
	buildDirectoryTree,
	composeLine,
	DEFAULT_INLINE_LIMIT,
	type DirectorySummary,
	formatDirectorySummary,
	formatInlineFiles,
	type RenderContext,
	renderDirectory,
} from "./change-tree-helpers.js";

export interface ChangeTreeFormatOptions {
	readonly maxInlineEntries?: number;
}

function summarizeRoot(
	root: ProjectTreeDirectory,
	changeMap: ReadonlyMap<string, FileChangeInfo>,
	inlineLimit: number,
): {
	readonly lines: string[];
	readonly summary: DirectorySummary;
	readonly directoryTree: ReturnType<typeof buildDirectoryTree>;
	readonly summaryMap: Map<string, DirectorySummary>;
} {
	const directoryTree = buildDirectoryTree(root, changeMap);
	const summaryMap = new Map<string, DirectorySummary>();
	const summary = aggregateDirectorySummaries(
		directoryTree,
		changeMap,
		summaryMap,
	);
	const inlineText = formatInlineFiles(
		directoryTree.files,
		changeMap,
		inlineLimit,
	);
	const summaryText = formatDirectorySummary(summary);
	const lines = [
		composeLine(`📁 ${directoryTree.name}/`, summaryText, inlineText),
	];
	return { lines, summary, directoryTree, summaryMap };
}

export function formatChangeTree(
	root: ProjectTreeDirectory,
	changeMap: ReadonlyMap<string, FileChangeInfo>,
	options: ChangeTreeFormatOptions = {},
): ReadonlyArray<string> {
	const specifiedLimit = options.maxInlineEntries;
	const inlineLimit =
		typeof specifiedLimit === "number" &&
		Number.isFinite(specifiedLimit) &&
		specifiedLimit > 1
			? Math.floor(specifiedLimit)
			: DEFAULT_INLINE_LIMIT;

	const { lines, directoryTree, summaryMap } = summarizeRoot(
		root,
		changeMap,
		inlineLimit,
	);

	const context: RenderContext = {
		summaryMap,
		changeMap,
		lines,
		inlineLimit,
	};
	renderDirectory(directoryTree, "", context);
	return lines;
}
