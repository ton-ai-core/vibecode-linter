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
} from "./config";
export type {
	DiffLineView,
	DiffSnippet,
	DiffSnippetSelection,
	DiffSymbol,
} from "./diff";
export { extractStdoutFromError } from "./exec-helpers";
export type {
	DiffRangeConfig,
	GitBlameOptions,
	GitBlameResult,
	GitDiffBlock,
	GitHistoryBlock,
} from "./git";
export type {
	BiomeMessage,
	ESLintMessage,
	LintMessage,
	LintMessageWithFile,
	LintResult,
	TypeScriptMessage,
} from "./messages";
export type {
	DuplicateInfo,
	SarifLocation,
	SarifReport,
	SarifResult,
} from "./sarif";
