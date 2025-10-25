// CHANGE: Created central export file for config module
// WHY: Provides a single import point for all configuration functions
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

export { parseCLIArgs } from "./cli.js";
export {
	loadLinterConfig,
	makeRuleLevelMap,
	type RuleLevelMap,
	ruleIdOf,
} from "./loader.js";
