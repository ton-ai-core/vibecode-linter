#!/usr/bin/env ts-node

// CHANGE: Simplified entry point using modular architecture
// WHY: All logic moved to src/ modules for better maintainability
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: Entire lint.ts refactored into src/ modules

import { main } from "./src/main.js";

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
