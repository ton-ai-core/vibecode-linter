// CHANGE: Extracted configuration loading from lint.ts
// WHY: Configuration loading logic should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import * as fs from "fs";
import * as path from "path";

import type { LinterConfig, PriorityLevel } from "../types/index.js";

/**
 * Валидирует и нормализует уровень приоритета.
 *
 * @param value Значение для валидации
 * @returns Нормализованный уровень приоритета или null
 */
function validatePriorityLevel(
	value: Record<string, string | number | string[]>,
): PriorityLevel | null {
	if (
		typeof value["level"] !== "number" ||
		typeof value["name"] !== "string" ||
		!Array.isArray(value["rules"])
	) {
		return null;
	}

	const rules = value["rules"]
		.filter((r): r is string => typeof r === "string")
		.map((r) => r.toLowerCase());

	return {
		level: value["level"],
		name: value["name"],
		rules,
	};
}

/**
 * Загружает конфигурацию линтера из файла linter.config.json.
 *
 * @param configPath Путь к файлу конфигурации
 * @returns Конфигурация линтера или null при ошибке
 */
export function loadLinterConfig(
	configPath = path.resolve(process.cwd(), "linter.config.json"),
): LinterConfig | null {
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const parsed = JSON.parse(raw) as Record<
			string,
			string | number | Array<Record<string, string | number | string[]>>
		>;

		if (!Array.isArray(parsed["priorityLevels"])) {
			return null;
		}

		const validatedLevels: PriorityLevel[] = [];
		for (const level of parsed["priorityLevels"]) {
			if (level && typeof level === "object" && !Array.isArray(level)) {
				const validated = validatePriorityLevel(level);
				if (validated) {
					validatedLevels.push(validated);
				}
			}
		}

		if (validatedLevels.length === 0) {
			return null;
		}

		return { priorityLevels: validatedLevels };
	} catch {
		return null;
	}
}

/**
 * Извлекает идентификатор правила из сообщения линтера.
 *
 * @param m Сообщение линтера (может содержать ruleId, code, rule, category)
 * @returns Идентификатор правила в нижнем регистре
 */
export function ruleIdOf(m: {
	ruleId?: string | null;
	code?: string;
	rule?: string;
	category?: string;
}): string {
	return String(m.ruleId ?? m.code ?? m.rule ?? m.category ?? "").toLowerCase();
}

/**
 * Создает карту правил с их уровнями приоритета.
 *
 * @param cfg Конфигурация линтера
 * @returns Карта: ruleId -> { level, name }
 */
export function makeRuleLevelMap(
	cfg: LinterConfig,
): Map<string, { level: number; name: string }> {
	const map = new Map<string, { level: number; name: string }>();
	for (const pl of cfg.priorityLevels) {
		for (const r of pl.rules) {
			map.set(r, { level: pl.level, name: pl.name });
		}
	}
	return map;
}
