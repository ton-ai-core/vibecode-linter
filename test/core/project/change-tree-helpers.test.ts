import { describe, expect, it } from "vitest";
import {
	buildDirectoryTree,
	formatDirectorySummary,
	formatInlineFiles,
	renderDirectory,
} from "../../../src/core/project/change-tree-helpers.js";
import { createProjectSnapshot } from "../../../src/core/project/tree.js";
import type {
	FileChangeInfo,
	ProjectTreeDirectory,
} from "../../../src/core/types/project-info.js";
import { makeChange, makeRecord, makeSiblingFiles } from "./fixtures.js";

describe("buildDirectoryTree — synthetic paths", () => {
	it("creates missing directories for change-only paths", () => {
		const snapshot = createProjectSnapshot("src", []);
		const map = new Map<string, FileChangeInfo>([
			["new/deep/file.ts", makeChange("M", "modified", 1, 0)],
		]);
		const tree = buildDirectoryTree(snapshot.root, map);
		expect([...tree.directories.keys()]).toEqual(["new"]);
		const deep = tree.directories.get("new")?.directories.get("deep");
		expect(deep?.files.has("file.ts")).toBe(true);
	});

	it("adds root-level files when change map introduces them", () => {
		const snapshot = createProjectSnapshot("src", []);
		const map = new Map<string, FileChangeInfo>([
			["root.ts", makeChange("M", "modified", 1, 0)],
		]);
		const tree = buildDirectoryTree(snapshot.root, map);
		expect(tree.files.get("root.ts")?.relativePath).toBe("root.ts");
	});
});

describe("buildDirectoryTree — snapshot parity", () => {
	it("does not duplicate existing file nodes when change map references snapshot files", () => {
		const snapshot = createProjectSnapshot("src", [
			makeRecord("existing.ts", 1, 1, 0),
		]);
		const map = new Map<string, FileChangeInfo>([
			["existing.ts", makeChange("M", "modified", 1, 0)],
		]);
		const tree = buildDirectoryTree(snapshot.root, map);
		expect(tree.files.size).toBe(1);
	});

	it("normalizes '.' relative paths on snapshot entries", () => {
		const root: ProjectTreeDirectory = {
			kind: "directory",
			name: "src",
			relativePath: ".",
			entries: [
				{
					kind: "file",
					name: "placeholder.ts",
					relativePath: ".",
					sizeBytes: 0,
					metrics: { lines: 0, characters: 0, functions: 0 },
				},
			],
			metrics: { lines: 0, characters: 0, functions: 0 },
			fileCount: 1,
			directoryCount: 1,
			sizeBytes: 0,
		};
		const tree = buildDirectoryTree(root, new Map());
		expect(tree.files.get("placeholder.ts")?.relativePath).toBe("");
	});
});

describe("buildDirectoryTree — invalid change entries", () => {
	it("skips change-map entries whose keys are empty", () => {
		const snapshot = createProjectSnapshot("src", []);
		const map = new Map<string, FileChangeInfo>([
			["", makeChange("M", "modified", 1, 0)],
		]);
		const tree = buildDirectoryTree(snapshot.root, map);
		expect(tree.directories.size).toBe(0);
	});

	it("ignores change-map paths that lack a file component", () => {
		const snapshot = createProjectSnapshot("src", []);
		const map = new Map<string, FileChangeInfo>([
			["/", makeChange("M", "modified", 1, 0)],
		]);
		const tree = buildDirectoryTree(snapshot.root, map);
		expect(tree.files.size).toBe(0);
	});
});

describe("formatInlineFiles", () => {
	it("returns empty string when directory has no direct files", () => {
		const inline = formatInlineFiles(new Map(), new Map(), 3);
		expect(inline).toBe("");
	});

	it("skips entries that are marked as directories", () => {
		const files = new Map([
			["ghost.ts", { name: "ghost.ts", relativePath: "ghost.ts" }],
		]);
		const changes = new Map<string, FileChangeInfo>([
			["ghost.ts", makeChange("M", "modified", 0, 0, true)],
		]);
		const inline = formatInlineFiles(files, changes, 3);
		expect(inline).toBe("");
	});
});

describe("formatDirectorySummary", () => {
	it("returns empty string when there are no changes", () => {
		expect(
			formatDirectorySummary({
				modifiedFiles: 0,
				untrackedFiles: 0,
				additions: 0,
				deletions: 0,
			}),
		).toBe("");
	});

	it("prints all token types when counts are non-zero", () => {
		expect(
			formatDirectorySummary({
				modifiedFiles: 2,
				untrackedFiles: 1,
				additions: 3,
				deletions: 1,
			}),
		).toBe("[M2 +3/-1 ?1]");
	});
});

describe("renderDirectory", () => {
	it("falls back to empty summary when entry is missing", () => {
		const snapshot = createProjectSnapshot("src", makeSiblingFiles());
		const tree = buildDirectoryTree(snapshot.root, new Map());
		const lines: string[] = [];
		renderDirectory(tree, "", {
			summaryMap: new Map(),
			changeMap: new Map(),
			lines,
			inlineLimit: 5,
		});
		expect(lines).toEqual(["├─ alpha/  file.ts", "└─ beta/  file.ts"]);
	});
});
