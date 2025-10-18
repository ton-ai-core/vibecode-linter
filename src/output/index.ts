// CHANGE: Central export for output module
// WHY: Single import point for result processing
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export {
	displayClonesFromSarif,
	generateSarifReport,
	parseSarifReport,
} from "./duplicates";
export { processResults } from "./printer";
