import type {
	FileChangeInfo,
	ProjectFileRecord,
} from "../../../src/core/types/project-info.js";

export const makeRecord = (
	relativePath: string,
	lines: number,
	chars: number,
	functions: number,
	sizeBytes?: number,
): ProjectFileRecord => ({
	relativePath,
	sizeBytes: sizeBytes ?? chars,
	extension: ".ts",
	metrics: { lines, characters: chars, functions },
});

export const SAMPLE_PROJECT_FILES: readonly ProjectFileRecord[] = [
	makeRecord("index.ts", 20, 150, 2),
	makeRecord("lib/util.ts", 10, 80, 1),
	makeRecord("lib/helpers/math.ts", 5, 40, 1),
];

export const makeChange = (
	statusLabel: string,
	category: FileChangeInfo["category"],
	additions: number,
	deletions: number,
	isDirectory = false,
): FileChangeInfo => ({
	statusLabel,
	category,
	additions,
	deletions,
	isDirectory,
});

export const makeSiblingFiles = (): readonly ProjectFileRecord[] => [
	makeRecord("alpha/file.ts", 1, 1, 0),
	makeRecord("beta/file.ts", 1, 1, 0),
];
