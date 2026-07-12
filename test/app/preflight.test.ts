// CHANGE: Add unit tests for preflight module extracted from runLinter.ts
// WHY: Verify preflight + dependency check semantics
// QUOTE(ТЗ): "Для библиотеки тестов я использую vitest"
// REF: Architecture plan - module-level unit tests
// PURITY: test (mocks SHELL utilities)

import { describe, expect, it, vi } from "vitest";

import { haveCliDependencies, preflightOk } from "../../src/app/preflight.js";
import type { CLIOptions } from "../../src/core/types/index.js";
import { Effect } from "effect";

vi.mock("../../src/shell/analysis/preflight.js", () => ({
	checkAndReportPreflight: vi.fn(),
}));

vi.mock("../../src/shell/utils/dependencies.js", () => ({
	checkDependencies: vi.fn(),
	reportMissingDependencies: vi.fn(),
}));

vi.mock("../../src/shell/utils/package-manager.js", () => ({
	formatInstallDevCommand: vi.fn(() => "pnpm add -D typescript @biomejs/biome"),
	resolvePackageManager: vi.fn(() => ({ packageManager: "pnpm" })),
}));

import { checkAndReportPreflight } from "../../src/shell/analysis/preflight.js";
import {
	checkDependencies,
	reportMissingDependencies,
} from "../../src/shell/utils/dependencies.js";

const cliOptions: CLIOptions = {
	targetPath: "/some/path",
	noFix: false,
	noPreflight: false,
	fixPeers: false,
	maxClones: 5,
	width: 120,
	packageManager: "pnpm",
};

describe("preflightOk", () => {
	it("returns true when noPreflight flag is set", () => {
		expect(preflightOk({ ...cliOptions, noPreflight: true })).toBe(true);
		expect(checkAndReportPreflight).not.toHaveBeenCalled();
	});

	it("returns true when preflight passes", () => {
		vi.mocked(checkAndReportPreflight).mockReturnValue({ ok: true, issues: [] });
		expect(preflightOk(cliOptions)).toBe(true);
	});

	it("returns false when preflight fails", () => {
		vi.mocked(checkAndReportPreflight).mockReturnValue({
			ok: false,
			issues: ["missingTypescript"],
		});
		expect(preflightOk(cliOptions)).toBe(false);
	});
});

describe("haveCliDependencies", () => {
	it("returns true when all deps are available", async () => {
		vi.mocked(checkDependencies).mockReturnValue(
			Effect.succeed({ allAvailable: true, missing: [] }),
		);

		const result = await Effect.runPromise(
			haveCliDependencies({ cwd: "/some", packageManager: "pnpm" }),
		);

		expect(result).toBe(true);
		expect(reportMissingDependencies).not.toHaveBeenCalled();
	});

	it("returns false and reports when deps are missing", async () => {
		vi.mocked(checkDependencies).mockReturnValue(
			Effect.succeed({ allAvailable: false, missing: ["typescript"] }),
		);

		const result = await Effect.runPromise(
			haveCliDependencies({ cwd: "/some", packageManager: "pnpm" }),
		);

		expect(result).toBe(false);
		expect(reportMissingDependencies).toHaveBeenCalledWith({
			cwd: "/some",
			packageManager: "pnpm",
			missing: ["typescript"],
		});
	});
});
