// CHANGE: Add unit tests for preflight checks and messaging
// WHY: Verify invariants and ensure clear English guidance is printed for users
// QUOTE(ТЗ): "При вызове команды писать внятно что необходимо сделать"
// REF: REQ-CLI-PREFLIGHT-PEERS, REQ-LINT-FIX
// SOURCE: n/a

import * as path from "node:path";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest"; // CHANGE: Migrate from Jest to Vitest
import {
	hasPackageJson,
	isNpxIsolatedProcess,
	type PreflightIssueCode,
	printPreflightReport,
	runPreflight,
} from "../../src/shell/analysis/preflight.js";
import { createTempProject } from "../utils/tempProject.js";

describe("preflight: filesystem and environment checks", () => {
	it("hasPackageJson returns false when package.json is absent", (): void => {
		const t = createTempProject({ withPackageJson: false });
		try {
			expect(hasPackageJson(t.cwd)).toBeFalsy();
		} finally {
			t.cleanup();
		}
	});

	it("hasPackageJson returns true when package.json exists", (): void => {
		const t = createTempProject({ withPackageJson: true });
		try {
			expect(hasPackageJson(t.cwd)).toBeTruthy();
		} finally {
			t.cleanup();
		}
	});

	it("isNpxIsolatedProcess detects cache marker", (): void => {
		const marker = path.join("/", ".npm", "_npx", "12345");
		const positive = isNpxIsolatedProcess(marker, "node", process.execPath);
		expect(positive).toBeTruthy();

		const negative = isNpxIsolatedProcess(
			"/user/project",
			"node",
			process.execPath,
		);
		expect(negative).toBeFalsy();
	});
});

describe("preflight: runPreflight scenarios (negative)", () => {
	it("empty directory -> noPackageJson + missing peers, ok=false", (): void => {
		const t = createTempProject({});
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBeFalsy();
			// At minimum, project root is missing
			expect(result.issues).toEqual(
				expect.arrayContaining<PreflightIssueCode>([
					"noPackageJson",
					"missingTypescript",
					"missingBiome",
				]),
			);
		} finally {
			t.cleanup();
		}
	});

	it("only package.json -> missing peers, ok=false", (): void => {
		const t = createTempProject({ withPackageJson: true });
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBeFalsy();
			expect(result.issues).toEqual(
				expect.arrayContaining<PreflightIssueCode>([
					"missingTypescript",
					"missingBiome",
				]),
			);
		} finally {
			t.cleanup();
		}
	});
});

describe("preflight: runPreflight scenarios (positive)", () => {
	it("package.json + typescript + biome -> ok=true (no blocking issues)", (): void => {
		const t = createTempProject({
			withPackageJson: true,
			withTypescript: true,
			withBiome: true,
		});
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBeTruthy();
			// No blocking issues expected
			const blocking: readonly PreflightIssueCode[] = result.issues.filter(
				(c) =>
					c === "noPackageJson" ||
					c === "missingTypescript" ||
					c === "missingBiome",
			);
			expect(blocking).toHaveLength(0);
		} finally {
			t.cleanup();
		}
	});
});

describe("preflight: printPreflightReport messages (English, actionable)", () => {
	// CHANGE: Setup spies helper with explicit types for Vitest
	// WHY: @typescript-eslint/explicit-function-return-type requires explicit types
	// PURITY: SHELL - mocking console for test isolation
	// INVARIANT: Mocks capture all console calls for assertion
	const setupSpies = (): {
		err: Mock;
		warn: Mock;
	} => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {
			// sink
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {
			// sink
		});
		return { err, warn };
	};

	afterEach((): void => {
		vi.restoreAllMocks();
	});

	it("printPreflightReport prints guidance for missing TypeScript and Biome", (): void => {
		const { err, warn } = setupSpies();
		const issues: readonly PreflightIssueCode[] = [
			"missingTypescript",
			"missingBiome",
		];

		printPreflightReport(issues);

		const errorOutput = err.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(errorOutput).toContain(
			"TypeScript (typescript) is not installed in this project.",
		);
		expect(errorOutput).toContain("npm install --save-dev typescript");
		expect(errorOutput).toContain(
			"Biome CLI (@biomejs/biome) is not installed in this project.",
		);
		expect(errorOutput).toContain("npm install --save-dev @biomejs/biome");

		// No advisory expected in this case
		expect(warn).not.toHaveBeenCalled();
	});

	it("printPreflightReport prints advisory for npxIsolated", (): void => {
		const { err, warn } = setupSpies();
		const issues: readonly PreflightIssueCode[] = ["npxIsolated"];

		printPreflightReport(issues);

		const warnOutput = warn.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(warnOutput).toContain("Detected isolated npx execution environment");
		expect(err).not.toHaveBeenCalled();
	});
});
