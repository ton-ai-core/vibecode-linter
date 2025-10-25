import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DuplicateInfo, SarifReport } from "../../src/core/types/index.js";
import { parseSarifReport } from "../../src/shell/output/duplicates.js";

/**
 * CHANGE: Add unit test for SARIF parsing via structured locations
 * WHY: Proof obligation — parser must not depend on message text and should work with SARIF locations
 * QUOTE(ТЗ): "На каждый REQ-ID — тест(ы) и ссылка из RTM"
 * REF: REQ-DUP-SARIF-OUT
 */

// Helpers (top-level) to keep the test body short
function mkdirp(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, data: SarifReport): void {
	fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, {
		encoding: "utf-8",
	});
}

function minimalSarif(a: string, b: string): SarifReport {
	return {
		runs: [
			{
				results: [
					{
						locations: [
							{
								physicalLocation: {
									artifactLocation: { uri: a },
									region: { startLine: 10, endLine: 20 },
								},
							},
							{
								physicalLocation: {
									artifactLocation: { uri: b },
									region: { startLine: 30, endLine: 40 },
								},
							},
						],
						// CHANGE: Provide required SARIF field with empty array for robustness
						// WHY: Our SarifResult type requires relatedLocations, even if unused
						relatedLocations: [],
						message: { text: "free-text not used for parsing" },
					},
				],
			},
		],
	};
}

describe("parseSarifReport (SARIF locations parsing)", (): void => {
	test("extracts duplicate info from SARIF locations (without relying on message text)", (): void => {
		const tmpRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "vibecode-linter-sarif-"),
		);
		const reportsDir = path.join(tmpRoot, "reports", "jscpd");
		mkdirp(reportsDir);

		const sarifPath = path.join(reportsDir, "jscpd-sarif.json");
		writeJson(
			sarifPath,
			minimalSarif("/abs/path/to/A.ts", "/abs/path/to/B.ts"),
		);

		const result = parseSarifReport(sarifPath);
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(1);

		// CHANGE: Narrow after length assertion using explicit cast for tests
		// WHY: TypeScript cannot narrow from expect(result.length).toBe(1); runtime guarantees > 0 here
		// REF: REQ-TS-SOLUTION-STYLE
		const dup = result[0] as DuplicateInfo;
		expect(dup.fileA).toBe("/abs/path/to/A.ts");
		expect(dup.fileB).toBe("/abs/path/to/B.ts");
		expect(dup.startA).toBe(10);
		expect(dup.endA).toBe(20);
		expect(dup.startB).toBe(30);
		expect(dup.endB).toBe(40);

		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});
});
