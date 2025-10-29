import { describe, expect, it } from "vitest";
import {
	__projectTreeInternals,
	createProjectSnapshot,
	formatProjectTree,
} from "../../../src/core/project/tree.js";
import { makeRecord, SAMPLE_PROJECT_FILES } from "./fixtures.js";

describe("createProjectSnapshot aggregates project-wide totals", () => {
	it("sums metrics and directory counts deterministically", () => {
		const snapshot = createProjectSnapshot("src", SAMPLE_PROJECT_FILES);
		expect(snapshot.totals).toEqual({
			lines: 35,
			characters: 270,
			functions: 4,
			fileCount: 3,
			directoryCount: 3,
			sizeBytes: 270,
		});
	});

	it("ignores records whose paths normalize to no segments", () => {
		const invalidRecord = {
			relativePath: ".",
			sizeBytes: 5,
			extension: ".ts",
			metrics: { lines: 1, characters: 5, functions: 0 },
		};
		const snapshot = createProjectSnapshot("src", [invalidRecord]);
		expect(snapshot.totals.fileCount).toBe(0);
	});
});

describe("formatProjectTree rendering", () => {
	it("renders nested directories with metrics and sizes", () => {
		const snapshot = createProjectSnapshot("src", SAMPLE_PROJECT_FILES);
		const lines = formatProjectTree(snapshot.root, { includeSize: true });
		expect(lines).toEqual([
			"src/ [files: 3, dirs: 2, 35L | 270C | 4ƒ | 270B]",
			"├── lib/ [files: 2, dirs: 1, 15L | 120C | 2ƒ | 120B]",
			"│   ├── helpers/ [files: 1, dirs: 0, 5L | 40C | 1ƒ | 40B]",
			"│   │   └── math.ts (5L | 40C | 1ƒ | 40B)",
			"│   └── util.ts (10L | 80C | 1ƒ | 80B)",
			"└── index.ts (20L | 150C | 2ƒ | 150B)",
		]);
	});

	it("formats byte sizes with higher units when necessary", () => {
		const bigFile = makeRecord("binary.dat", 1, 10, 0, 2048);
		const snapshot = createProjectSnapshot("src", [bigFile]);
		const lines = formatProjectTree(snapshot.root, { includeSize: true });
		expect(lines).toEqual([
			"src/ [files: 1, dirs: 0, 1L | 10C | 0ƒ | 2.0KB]",
			"└── binary.dat (1L | 10C | 0ƒ | 2.0KB)",
		]);
	});

	it("normalizes Windows-style paths and leading ./ segments", () => {
		const files = [makeRecord("./docs\\guides\\intro.ts", 3, 30, 1)];
		const snapshot = createProjectSnapshot("src", files);
		const lines = formatProjectTree(snapshot.root, { includeSize: false });
		expect(lines).toEqual([
			"src/ [files: 1, dirs: 2, 3L | 30C | 1ƒ]",
			"└── docs/ [files: 1, dirs: 1, 3L | 30C | 1ƒ]",
			"    └── guides/ [files: 1, dirs: 0, 3L | 30C | 1ƒ]",
			"        └── intro.ts (3L | 30C | 1ƒ)",
		]);
	});

	it("omits size text when byte size is zero even with includeSize", () => {
		const empty = makeRecord("empty.ts", 0, 0, 0, 0);
		const snapshot = createProjectSnapshot("src", [empty]);
		const lines = formatProjectTree(snapshot.root, { includeSize: true });
		expect(lines).toEqual([
			"src/ [files: 1, dirs: 0, 0L | 0C | 0ƒ]",
			"└── empty.ts (0L | 0C | 0ƒ)",
		]);
	});

	it("uses default options when not provided", () => {
		const snapshot = createProjectSnapshot("src", SAMPLE_PROJECT_FILES);
		const lines = formatProjectTree(snapshot.root);
		expect(lines[0]).toBe("src/ [files: 3, dirs: 2, 35L | 270C | 4ƒ]");
	});
});

describe("project tree internals", () => {
	const { formatSize, normalizeSegments } = __projectTreeInternals;

	it("normalizes '.' to an empty segment list", () => {
		expect(normalizeSegments(".")).toEqual([]);
	});

	it("normalizes empty strings to an empty segment list", () => {
		expect(normalizeSegments("")).toEqual([]);
	});

	it("returns empty string for non-positive sizes", () => {
		expect(formatSize(0)).toBe("");
	});

	it("formats values >= 10 without decimals", () => {
		expect(formatSize(10)).toBe("10B");
	});
});
