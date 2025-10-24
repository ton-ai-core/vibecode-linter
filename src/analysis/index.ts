// CHANGE: Created central export file for analysis module
// WHY: Provides a single import point for dependency analysis
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export {
	buildDependencyEdges,
	buildProgram,
	topologicalSort,
} from "./dependencies.js";
