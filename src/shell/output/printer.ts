// CHANGE: Extracted result printing logic from lint.ts
// WHY: Result processing and output should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1558-1813

import { Effect } from "effect";

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

function printSections(
	sections: Map<string, LintMessageWithFile[]>,
	diffRange: { diffArg: string; label: string },
	diffContext: number,
): Effect.Effect<void> {
	return Effect.gen(function* (_) {
		for (const [name, arr] of sections) {
			console.log(`\n=== ${name} (${arr.length} issues) ===`);
			const cache = new Map<string, readonly string[]>();
			for (const m of arr) {
				yield* _(printMessage(m, cache, diffRange, diffContext));
			}
		}
	});
}

/**
 * Обрабатывает и выводит результаты линтинга.
 *
 * @param messages Массив сообщений
 * @param config Конфигурация линтера
 * @param cliOptions Опции CLI
 * @returns True если есть ошибки
 */
export function processResults(
	messages: readonly LintMessageWithFile[],
	config: LinterConfig | null,
	cliOptions: CLIOptions,
): Effect.Effect<boolean> {
	const sortedMessages = sortMessages(messages);
	const ruleLevelMap = config ? makeRuleLevelMap(config) : null;
	const diffContext = cliOptions.context ?? 3;

	return Effect.gen(function* (_) {
		const diffRange =
			sortedMessages.length > 0
				? yield* _(detectDiffRange())
				: { diffArg: "HEAD", label: "HEAD" };

		if (sortedMessages.length > 0) {
			const byLevel = groupByLevel(sortedMessages, ruleLevelMap);
			const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

			for (const level of sortedLevels) {
				const levelMessages = byLevel.get(level);
				if (levelMessages && levelMessages.length > 0) {
					const sections = groupBySections(levelMessages, ruleLevelMap);
					yield* _(printSections(sections, diffRange, diffContext));
					break;
				}
			}
		}

		printStatistics(sortedMessages);
		return sortedMessages.filter((m) => m.severity === 2).length > 0;
	});
}
