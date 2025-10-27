// CHANGE: Add unit tests for CLI argument parsing
// WHY: Ensure flags and positional arguments are parsed deterministically with strict typing
// QUOTE(ТЗ): "Никогда не использовать any, unknown"; "Давать проверяемые решения через формализацию"
// REF: REQ-20250210-MODULAR-ARCH, REQ-LINT-FIX
// SOURCE: n/a

import type { CLIOptions } from "../../src/core/types/index.js";
import { parseCLIArgs } from "../../src/shell/config/index.js";

/**
 * Safely set process.argv for the duration of a test and restore afterwards.
 *
 * Invariants:
 * - Always restore original argv to avoid cross-test contamination.
 */
function withArgv<T>(args: readonly string[], fn: () => T): T {
	const original = process.argv.slice();
	try {
		// First two entries are node and script placeholders
		process.argv = [original[0] ?? "node", original[1] ?? "script.js", ...args];
		return fn();
	} finally {
		process.argv = original;
	}
}

describe("parseCLIArgs: defaults and positional", () => {
	test("returns defaults when no args provided", (): void => {
		const opts = withArgv([], () => parseCLIArgs());
		// CHANGE: Assert default values from implementation
		// WHY: Guard against accidental regressions
		expect(opts.targetPath).toBe(".");
		expect(opts.maxClones).toBe(15);
		expect(typeof opts.width).toBe("number");
		expect(opts.noFix).toBe(false);
		expect(opts.noPreflight).toBe(false);
		expect(opts.fixPeers).toBe(false);
	});

	test("parses single positional as targetPath", (): void => {
		const opts = withArgv(["src/"], () => parseCLIArgs());
		expect(opts.targetPath).toBe("src/");
	});

	test("ignores empty string arguments", (): void => {
		const opts = withArgv(["", "src"], () => parseCLIArgs());
		expect(opts.targetPath).toBe("src");
	});
});

describe("parseCLIArgs: numeric flags", () => {
	test("--max-clones 20 sets maxClones", (): void => {
		const opts = withArgv(["--max-clones", "20"], () => parseCLIArgs());
		expect(opts.maxClones).toBe(20);
	});

	test("--width 200 sets width", (): void => {
		const opts = withArgv(["--width", "200"], () => parseCLIArgs());
		expect(opts.width).toBe(200);
	});

	test("--context 5 sets context", (): void => {
		const opts = withArgv(["--context", "5"], () => parseCLIArgs());
		expect(opts.context).toBe(5);
	});

	test("numeric flags skip next token (do not treat it as positional)", (): void => {
		const opts = withArgv(["--max-clones", "7", "src"], () => parseCLIArgs());
		expect(opts.maxClones).toBe(7);
		expect(opts.targetPath).toBe("src");
	});
});

describe("parseCLIArgs: boolean flags", () => {
	test("--no-fix flips noFix=true", (): void => {
		const opts = withArgv(["--no-fix"], () => parseCLIArgs());
		expect(opts.noFix).toBe(true);
	});

	test("--no-preflight flips noPreflight=true", (): void => {
		const opts = withArgv(["--no-preflight"], () => parseCLIArgs());
		expect(opts.noPreflight).toBe(true);
	});

	test("--fix-peers flips fixPeers=true", (): void => {
		const opts = withArgv(["--fix-peers"], () => parseCLIArgs());
		expect(opts.fixPeers).toBe(true);
	});

	test("combines boolean and numeric flags with positional", (): void => {
		const opts: CLIOptions = withArgv(
			[
				"--no-fix",
				"--max-clones",
				"9",
				"src/components",
				"--fix-peers",
				"--no-preflight",
			],
			() => parseCLIArgs(),
		);
		expect(opts.noFix).toBe(true);
		expect(opts.maxClones).toBe(9);
		expect(opts.targetPath).toBe("src/components");
		expect(opts.fixPeers).toBe(true);
		expect(opts.noPreflight).toBe(true);
	});
});
