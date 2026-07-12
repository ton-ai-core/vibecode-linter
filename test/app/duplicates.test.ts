// CHANGE: Add unit tests for duplicates module extracted from runLinter.ts
// WHY: Verify duplicate detection + cleanup behavior is preserved
// QUOTE(ТЗ): "Для библиотеки тестов я использую vitest"
// REF: Architecture plan - module-level unit tests
// PURITY: test (mocks SHELL output functions)

import { describe, expect, it, vi } from "vitest";

import { handleDuplicates } from "../../src/app/duplicates.js";
import type { CLIOptions } from "../../src/core/types/index.js";

vi.mock("../../src/shell/output/index.js", () => ({
	parseSarifReport: vi.fn(),
	displayClonesFromSarif: vi.fn(),
	cleanupReportsArtifacts: vi.fn(),
}));

import {
	cleanupReportsArtifacts,
	displayClonesFromSarif,
	parseSarifReport,
} from "../../src/shell/output/index.js";

const baseCliOptions: CLIOptions = {
	targetPath: "/some/path",
	noFix: false,
	noPreflight: false,
	fixPeers: false,
	maxClones: 5,
	width: 120,
	packageManager: "pnpm",
};

describe("handleDuplicates", () => {
	it("returns false when SARIF has no duplicates and cleans up", () => {
		vi.mocked(parseSarifReport).mockReturnValue([]);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = handleDuplicates(false, "/tmp/report.sarif", baseCliOptions);

		expect(result).toBe(false);
		expect(displayClonesFromSarif).not.toHaveBeenCalled();
		expect(cleanupReportsArtifacts).toHaveBeenCalledWith(
			"/tmp/report.sarif",
			false,
		);
		logSpy.mockRestore();
	});

	it("returns true and displays clones when duplicates exist", () => {
		const fakeDuplicates = [
			{ file1: "a.ts", file2: "b.ts", lines: 10 },
		] as never;
		vi.mocked(parseSarifReport).mockReturnValue(fakeDuplicates);

		const result = handleDuplicates(false, "/tmp/report.sarif", baseCliOptions);

		expect(result).toBe(true);
		expect(displayClonesFromSarif).toHaveBeenCalledWith(
			fakeDuplicates,
			5,
			120,
		);
		expect(cleanupReportsArtifacts).toHaveBeenCalledWith(
			"/tmp/report.sarif",
			true,
		);
	});

	it("suppresses output when lint errors exist", () => {
		vi.mocked(parseSarifReport).mockReturnValue([
			{ file1: "a.ts", file2: "b.ts", lines: 10 },
		] as never);

		const result = handleDuplicates(true, "/tmp/report.sarif", baseCliOptions);

		expect(result).toBe(true);
		expect(displayClonesFromSarif).not.toHaveBeenCalled();
		expect(cleanupReportsArtifacts).toHaveBeenCalledWith(
			"/tmp/report.sarif",
			true,
		);
	});
});
