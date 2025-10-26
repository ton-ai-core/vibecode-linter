// CHANGE: Created central export file for all type definitions
// WHY: Provides a single import point for all types used across modules
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export type {
	CLIOptions,
	ExecError,
	LinterConfig,
	PriorityLevel,
} from "./config.js";
export type {
	DiffLineView,
	DiffSnippet,
	DiffSnippetSelection,
	DiffSymbol,
} from "./diff.js";
export { extractStdoutFromError } from "./exec-helpers.js";
export type {
	DiffRangeConfig,
	GitBlameOptions,
	GitBlameResult,
	GitDiffBlock,
	GitHistoryBlock,
} from "./git.js";
export type {
	BiomeMessage,
	ESLintMessage,
	LintMessage,
	LintMessageWithFile,
	LintResult,
	TypeScriptMessage,
} from "./messages.js";
export {
	isBiomeMessage,
	isESLintMessage,
	isTypeScriptMessage,
} from "./messages.js";
export type {
	FileChangeCategory,
	FileChangeInfo,
	FileContentMetrics,
	ProjectAggregateMetrics,
	ProjectFileRecord,
	ProjectSnapshot,
	ProjectTreeDirectory,
	ProjectTreeFile,
	ProjectTreeNode,
	TreeFormatOptions,
} from "./project-info.js";
export type {
	DuplicateInfo,
	SarifLocation,
	SarifReport,
	SarifResult,
} from "./sarif.js";
