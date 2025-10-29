import { describe, expect, it } from "vitest";
import { formatChangeTree } from "../../../src/core/project/change-tree.js";
import { createProjectSnapshot } from "../../../src/core/project/tree.js";
import type { FileChangeInfo } from "../../../src/core/types/project-info.js";
import {
	makeChange,
	makeRecord,
	makeSiblingFiles,
	SAMPLE_PROJECT_FILES,
} from "./fixtures.js";

const baseSnapshot = createProjectSnapshot("src", SAMPLE_PROJECT_FILES);

describe("formatChangeTree — summaries", () => {
	it("summarizes directory changes and omits directories from inline lists", () => {
		const map = new Map<string, FileChangeInfo>([
			["index.ts", makeChange("M", "modified", 4, 1)],
			["lib/util.ts", makeChange("M", "modified", 1, 1)],
			["lib/helpers/math.ts", makeChange("??", "untracked", 0, 0)],
			["lib", makeChange("M", "modified", 0, 0, true)],
		]);
		const lines = formatChangeTree(baseSnapshot.root, map);
		expect(lines).toEqual([
			"📁 src/  [M3 +5/-2 ?1]  M index.ts (+4/-1)",
			"└─ lib/  [M2 +1/-1 ?1]  M util.ts (+1/-1)",
			"   └─ helpers/  [?1]  ?? math.ts",
		]);
	});

	it("lists unchanged files without prefixes when change metadata is absent", () => {
		const extendedSnapshot = createProjectSnapshot("src", [
			...SAMPLE_PROJECT_FILES,
			makeRecord("notes.md", 2, 20, 0),
		]);
		const map = new Map<string, FileChangeInfo>([
			["index.ts", makeChange("M", "modified", 4, 1)],
			["lib/util.ts", makeChange("M", "modified", 1, 1)],
			["lib/helpers/math.ts", makeChange("??", "untracked", 0, 0)],
		]);
		const lines = formatChangeTree(extendedSnapshot.root, map);
		expect(lines[0]).toBe(
			"📁 src/  [M2 +5/-2 ?1]  M index.ts (+4/-1), notes.md",
		);
	});
});

describe("formatChangeTree — inline behavior", () => {
	it("applies inline entry limits before appending ellipsis", () => {
		const manyFiles = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"].map(
			(name) => makeRecord(name, 1, 1, 0),
		);
		const manySnapshot = createProjectSnapshot("src", manyFiles);
		const changes = new Map<string, FileChangeInfo>(
			manyFiles.map((file) => [
				file.relativePath,
				makeChange("M", "modified", 1, 0),
			]),
		);
		const lines = formatChangeTree(manySnapshot.root, changes, {
			maxInlineEntries: 2,
		});
		expect(lines[0]).toBe(
			"📁 src/  [M6 +6/-0]  M a.ts (+1/-0), M b.ts (+1/-0), …",
		);
	});

	it("ignores change map entries tagged as directories for files, producing empty summary", () => {
		const snapshot = createProjectSnapshot("src", [
			makeRecord("ghost.ts", 1, 1, 0),
		]);
		const map = new Map<string, FileChangeInfo>([
			["ghost.ts", makeChange("M", "modified", 0, 0, true)],
		]);
		const lines = formatChangeTree(snapshot.root, map);
		expect(lines).toEqual(["📁 src/"]);
	});
});

describe("formatChangeTree — synthetic nodes", () => {
	it("creates synthetic nodes for paths that only exist in change map", () => {
		const emptySnapshot = createProjectSnapshot("src", []);
		const map = new Map<string, FileChangeInfo>([
			["extras/feature.ts", makeChange("M", "modified", 2, 0)],
		]);
		const lines = formatChangeTree(emptySnapshot.root, map);
		expect(lines).toEqual([
			"📁 src/  [M1 +2/-0]",
			"└─ extras/  [M1 +2/-0]  M feature.ts (+2/-0)",
		]);
	});
});

describe("formatChangeTree — defensive cases", () => {
	it("still renders output when change maps contain empty keys", () => {
		const snapshot = createProjectSnapshot("src", [
			makeRecord("only.ts", 1, 1, 0),
		]);
		const map = new Map<string, FileChangeInfo>([
			["", makeChange("M", "modified", 10, 0, true)],
			["only.ts", makeChange("M", "modified", 1, 0)],
		]);
		const lines = formatChangeTree(snapshot.root, map);
		expect(lines).toEqual(["📁 src/  [M2 +11/-0]  M only.ts (+1/-0)"]);
	});

	it("handles directories that only contain nested directories", () => {
		const snapshot = createProjectSnapshot("src", [
			makeRecord("docs/guides/intro.ts", 2, 20, 1),
		]);
		const map = new Map<string, FileChangeInfo>([
			["docs/guides/intro.ts", makeChange("M", "modified", 2, 0)],
		]);
		const lines = formatChangeTree(snapshot.root, map);
		expect(lines).toEqual([
			"📁 src/  [M1 +2/-0]",
			"└─ docs/  [M1 +2/-0]",
			"   └─ guides/  [M1 +2/-0]  M intro.ts (+2/-0)",
		]);
	});

	it("renders sibling directories with both connector styles", () => {
		const snapshot = createProjectSnapshot("src", makeSiblingFiles());
		const map = new Map<string, FileChangeInfo>([
			["alpha/file.ts", makeChange("M", "modified", 1, 0)],
			["beta/file.ts", makeChange("M", "modified", 1, 0)],
		]);
		const lines = formatChangeTree(snapshot.root, map);
		expect(lines).toEqual([
			"📁 src/  [M2 +2/-0]",
			"├─ alpha/  [M1 +1/-0]  M file.ts (+1/-0)",
			"└─ beta/  [M1 +1/-0]  M file.ts (+1/-0)",
		]);
	});
});
