// CHANGE: Add unit tests for preflight checks and messaging
// WHY: Verify invariants and ensure clear English guidance is printed for users
// QUOTE(ТЗ): "При вызове команды писать внятно что необходимо сделать"
// REF: REQ-CLI-PREFLIGHT-PEERS, REQ-LINT-FIX
// SOURCE: n/a

import * as path from "node:path";
import { jest } from "@jest/globals"; // CHANGE: ESM Jest requires explicit import of 'jest' in ESM modules
import {
	hasPackageJson,
	isNpxIsolatedProcess,
	type PreflightIssueCode,
	printPreflightReport,
	runPreflight,
} from "../../src/shell/analysis/preflight.js";
import { createTempProject } from "../utils/tempProject.js";

describe("preflight: filesystem and environment checks", () => {
	test("hasPackageJson returns false when package.json is absent", (): void => {
		const t = createTempProject({ withPackageJson: false });
		try {
			expect(hasPackageJson(t.cwd)).toBe(false);
		} finally {
			t.cleanup();
		}
	});

	test("hasPackageJson returns true when package.json exists", (): void => {
		const t = createTempProject({ withPackageJson: true });
		try {
			expect(hasPackageJson(t.cwd)).toBe(true);
		} finally {
			t.cleanup();
		}
	});

	test("isNpxIsolatedProcess detects cache marker", (): void => {
		const marker = path.join("/", ".npm", "_npx", "12345");
		const positive = isNpxIsolatedProcess(marker, "node", process.execPath);
		expect(positive).toBe(true);

		const negative = isNpxIsolatedProcess(
			"/user/project",
			"node",
			process.execPath,
		);
		expect(negative).toBe(false);
	});
});

describe("preflight: runPreflight scenarios (negative)", () => {
	test("empty directory -> noPackageJson + missing peers, ok=false", (): void => {
		const t = createTempProject({});
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBe(false);
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

	test("only package.json -> missing peers, ok=false", (): void => {
		const t = createTempProject({ withPackageJson: true });
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBe(false);
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
	test("package.json + typescript + biome -> ok=true (no blocking issues)", (): void => {
		const t = createTempProject({
			withPackageJson: true,
			withTypescript: true,
			withBiome: true,
		});
		try {
			const result = runPreflight(t.cwd);
			expect(result.ok).toBe(true);
			// No blocking issues expected
			const blocking: readonly PreflightIssueCode[] = result.issues.filter(
				(c) =>
					c === "noPackageJson" ||
					c === "missingTypescript" ||
					c === "missingBiome",
			);
			expect(blocking.length).toBe(0);
		} finally {
			t.cleanup();
		}
	});
});

describe("preflight: printPreflightReport messages (English, actionable)", () => {
	const setupSpies = (): {
		err: jest.SpiedFunction<typeof console.error>;
		warn: jest.SpiedFunction<typeof console.warn>;
	} => {
		const err = jest.spyOn(console, "error").mockImplementation(() => {
			// sink
		});
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {
			// sink
		});
		return { err, warn };
	};

	afterEach((): void => {
		jest.restoreAllMocks();
	});

	test("printPreflightReport prints guidance for missing TypeScript and Biome", (): void => {
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

	test("printPreflightReport prints advisory for npxIsolated", (): void => {
		const { err, warn } = setupSpies();
		const issues: readonly PreflightIssueCode[] = ["npxIsolated"];

		printPreflightReport(issues);

		const warnOutput = warn.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(warnOutput).toContain("Detected isolated npx execution environment");
		expect(err).not.toHaveBeenCalled();
	});
});
