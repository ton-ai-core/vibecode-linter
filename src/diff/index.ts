// CHANGE: Created central export file for diff module
// WHY: Provides a single import point for all diff-related functions
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export {
	computeRealColumnFromVisual,
	expandTabs,
	TAB_WIDTH,
	visualColumnAt,
} from "./column";
export { extractDiffSnippet, pickSnippetForLine } from "./parser";
