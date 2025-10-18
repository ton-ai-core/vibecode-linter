// CHANGE: Central export for linters module
// WHY: Single import point for all linter operations
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export type { BiomeResult } from "./biome";
export { getBiomeDiagnostics, runBiomeFix } from "./biome";
export type { ESLintResult } from "./eslint";
export { getESLintResults, runESLintFix } from "./eslint";
export { getTypeScriptDiagnostics } from "./typescript";
