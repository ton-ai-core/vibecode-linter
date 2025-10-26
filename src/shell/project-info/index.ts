// CHANGE: Barrel file for project insight shell module
// WHY: Provide single import for report effect
// QUOTE(ТЗ): "Зависимости: SHELL → CORE (но не наоборот)"
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: export = { reportProjectInsightsEffect }
// PURITY: SHELL
// EFFECT: n/a (re-export only)
export { reportProjectInsightsEffect } from "./report.js";
