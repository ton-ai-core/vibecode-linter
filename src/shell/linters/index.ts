// CHANGE: Central export for linters module
// WHY: Single import point for all linter operations
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export type { BiomeResult } from "./biome.js";
export { getBiomeDiagnostics, runBiomeFix } from "./biome.js";
export type { ESLintResult } from "./eslint.js";
export { getESLintResults, runESLintFix } from "./eslint.js";
export { getTypeScriptDiagnostics } from "./typescript.js";
