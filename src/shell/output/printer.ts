// CHANGE: Extracted result printing logic from lint.ts
// WHY: Result processing and output should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1558-1813

import type {
	CLIOptions,
	LinterConfig,
	LintMessageWithFile,
} from "../../core/types/index.js";
import { makeRuleLevelMap } from "../config/index.js";
import { detectDiffRange } from "../git/index.js";
import {
	groupByLevel,
	groupBySections,
	printMessage,
	printStatistics,
	sortMessages,
} from "./printer-helpers.js";

async function printSections(
	sections: Map<string, LintMessageWithFile[]>,
	diffRange: { diffArg: string; label: string },
	diffContext: number,
): Promise<void> {
	for (const [name, arr] of sections) {
		console.log(`\n=== ${name} (${arr.length} issues) ===`);
		const cache = new Map<string, ReadonlyArray<string>>();
		for (const m of arr) {
			await printMessage(m, cache, diffRange, diffContext);
		}
	}
}

/**
 * Обрабатывает и выводит результаты линтинга.
 *
 * @param messages Массив сообщений
 * @param config Конфигурация линтера
 * @param cliOptions Опции CLI
 * @returns True если есть ошибки
 */
export async function processResults(
	messages: ReadonlyArray<LintMessageWithFile>,
	config: LinterConfig | null,
	cliOptions: CLIOptions,
): Promise<boolean> {
	const sortedMessages = sortMessages(messages);
	const ruleLevelMap = config ? makeRuleLevelMap(config) : null;
	const diffRange =
		sortedMessages.length > 0
			? await detectDiffRange()
			: { diffArg: "HEAD", label: "HEAD" };
	const diffContext = cliOptions.context ?? 3;

	if (sortedMessages.length > 0) {
		const byLevel = groupByLevel(sortedMessages, ruleLevelMap);
		const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

		for (const level of sortedLevels) {
			const levelMessages = byLevel.get(level);
			if (levelMessages && levelMessages.length > 0) {
				const sections = groupBySections(levelMessages, ruleLevelMap);
				await printSections(sections, diffRange, diffContext);
				break;
			}
		}
	}

	printStatistics(sortedMessages);
	return sortedMessages.filter((m) => m.severity === 2).length > 0;
}
