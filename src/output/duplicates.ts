// CHANGE: Extracted duplicate detection from lint.ts
// WHY: SARIF parsing and duplicate display should be separate
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1196-1284, 1815-1893

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import type { DuplicateInfo, SarifReport } from "../types/index.js";

const execAsync = promisify(exec);

/**
 * Генерирует SARIF отчет с помощью jscpd.
 *
 * @returns Путь к сгенерированному SARIF файлу
 */
export async function generateSarifReport(): Promise<string> {
	// Generate SARIF report using jscpd
	const reportsDir = "reports/jscpd";
	const sarifPath = path.join(reportsDir, "jscpd-sarif.json");

	// Ensure reports directory exists
	if (!fs.existsSync("reports")) {
		fs.mkdirSync("reports");
	}
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir);
	}

	try {
		await execAsync(`npx jscpd src`);
	} catch {
		// jscpd exits with a non-zero code when duplicates are found; treat as expected
		// SARIF file should still be generated
	}

	return sarifPath;
}

/**
 * Парсит SARIF отчет и извлекает информацию о дубликатах.
 *
 * @param sarifPath Путь к SARIF файлу
 * @returns Массив информации о дубликатах
 */
export function parseSarifReport(
	sarifPath: string,
): ReadonlyArray<DuplicateInfo> {
	try {
		if (!fs.existsSync(sarifPath)) {
			return [];
		}

		const sarifContent = fs.readFileSync(sarifPath, "utf8");
		const sarif = JSON.parse(sarifContent) as SarifReport;
		const duplicates: DuplicateInfo[] = [];

		if (!sarif.runs || !sarif.runs[0] || !sarif.runs[0].results) {
			return [];
		}

		for (const result of sarif.runs[0].results) {
			if (result.locations && result.locations.length > 0 && result.message) {
				// Parse message to extract the second location when available
				const messageText = result.message.text;
				const locationMatch = messageText.match(
					/Clone detected in typescript, - (.+?)\[(\d+):(\d+) - (\d+):(\d+)\] and (.+?)\[(\d+):(\d+) - (\d+):(\d+)\]/,
				);

				if (locationMatch) {
					const [
						,
						fileA,
						startLineA,
						,
						endLineA,
						,
						fileB,
						startLineB,
						,
						endLineB,
					] = locationMatch;

					if (
						fileA &&
						startLineA &&
						endLineA &&
						fileB &&
						startLineB &&
						endLineB
					) {
						duplicates.push({
							fileA,
							fileB,
							startA: Number.parseInt(startLineA, 10),
							endA: Number.parseInt(endLineA, 10),
							startB: Number.parseInt(startLineB, 10),
							endB: Number.parseInt(endLineB, 10),
						});
					}
				}
			}
		}

		return duplicates;
	} catch (error) {
		console.error("Error parsing SARIF report:", error);
		return [];
	}
}

/**
 * Отображает дубликаты кода из SARIF отчета.
 *
 * @param duplicates Массив информации о дубликатах
 * @param maxClones Максимальное количество дубликатов для отображения
 * @param width Ширина терминала
 */
export function displayClonesFromSarif(
	duplicates: ReadonlyArray<DuplicateInfo>,
	maxClones: number,
	width: number,
): void {
	const limitedDuplicates = duplicates.slice(0, maxClones);

	for (let i = 0; i < limitedDuplicates.length; i += 1) {
		const dup = limitedDuplicates[i];
		if (!dup) {
			continue;
		}
		const dupNum = i + 1;

		console.log(
			`\n=========================== DUPLICATE #${dupNum} ===========================`,
		);
		console.log(
			`A: ${dup.fileA}:${dup.startA}-${dup.endA}                 │ B: ${dup.fileB}:${dup.startB}-${dup.endB}`,
		);
		console.log(
			"-------------------------------------------┆------------------------------------------",
		);

		try {
			// Read both files to display code blocks side by side
			const fileAContent = fs.readFileSync(dup.fileA, "utf8").split("\n");
			const fileBContent = fs.readFileSync(dup.fileB, "utf8").split("\n");

			// Calculate the range to display
			const linesA = dup.endA - dup.startA + 1;
			const linesB = dup.endB - dup.startB + 1;
			const minLines = Math.min(linesA, linesB); // Show minimum common lines

			for (let lineIdx = 0; lineIdx < minLines; lineIdx += 1) {
				const lineNumA = dup.startA + lineIdx;
				const lineNumB = dup.startB + lineIdx;

				const contentA = fileAContent[lineNumA - 1] || "";
				const contentB = fileBContent[lineNumB - 1] || "";

				// Truncate lines to fit the terminal width
				const availableWidth = width - 20; // Reserve space for line numbers and separators
				const halfWidth = Math.floor(availableWidth / 2);

				const truncatedA =
					contentA.length > halfWidth
						? contentA.substring(0, halfWidth - 1) + "…"
						: contentA;
				const truncatedB =
					contentB.length > halfWidth
						? contentB.substring(0, halfWidth - 1) + "…"
						: contentB;

				console.log(
					`${lineNumA.toString().padStart(3)} │ ${truncatedA.padEnd(halfWidth)} │ ${lineNumB.toString().padStart(3)} │ ${truncatedB}`,
				);
			}
		} catch {
			console.log(`⚠ cannot read ${dup.fileA} or ${dup.fileB}`);
		}
	}

	if (duplicates.length >= maxClones) {
		console.log(
			`\n(Showing first ${maxClones} of ${duplicates.length}+ duplicates found)`,
		);
	}
}
