// CHANGE: Created central export file for git module
// WHY: Provides a single import point for all git-related functions
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export { getGitBlameBlock } from "./blame.js";
export { getGitDiffBlock } from "./diff.js";
export {
	type CommitDiffBlock,
	type CommitInfo,
	getCommitDiffBlocks,
	getGitHistoryBlock,
} from "./history.js";
export {
	detectDiffRange,
	execGitCommand,
	getCommitSnippetForLine,
	getWorkspaceSnippet,
} from "./utils.js";
