#!/usr/bin/env node

// CHANGE: Introduce thin CLI shell wrapper that is the only place calling process.exit
// WHY: Enforce Functional Core, Imperative Shell. Core returns ExitCode; shell exits the process.
// QUOTE(ТЗ): "CORE никогда не вызывает SHELL" / "Все эффекты (IO) изолированы в тонкой оболочке"
// REF: Architecture plan (Iteration 1 scaffolding)
// FORMAT THEOREM: ∀run ∈ App: returns exitCode ∈ {0,1} → process.exit(exitCode) occurs exactly once at shell boundary
// PURITY: SHELL
// INVARIANT: Single point of termination; no process.exit in CORE
// COMPLEXITY: O(1) time/space (delegates to core)

import { main } from "../main.js";

/**
 * CLI entry point for vibecode-linter.
 *
 * @remarks
 * - @pure false (contains side effects: process termination and console I/O)
 * - @invariant exit code is 0 when no errors/duplicates, otherwise 1
 * - @postcondition process terminates exactly once with ExitCode ∈ {0,1}
 * - @complexity O(1) — orchestration only
 */
void (async (): Promise<void> => {
	try {
		const code = await main();
		// Shell boundary: single process exit
		process.exit(code);
	} catch (error) {
		// Shell boundary: report fatal and exit with failure
		// NOTE: logging remains in shell; core returns typed results
		console.error("Fatal error:", error);
		process.exit(1);
	}
})();
