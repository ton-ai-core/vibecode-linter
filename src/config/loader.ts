// CHANGE: Extracted configuration loading from lint.ts
// WHY: Configuration loading logic should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import * as fs from "node:fs";
import * as path from "node:path";

import type { LinterConfig, PriorityLevel } from "../types/index.js";

/**
 * Валидирует и нормализует уровень приоритета.
 *
 * @param value Значение для валидации
 * @returns Нормализованный уровень приоритета или null
 */
// CHANGE: Use literal keys with proper typing to satisfy both Biome and TypeScript
// WHY: Biome wants literal keys, TypeScript wants them for non-index types
// REF: lint/complexity/useLiteralKeys
// SOURCE: https://biomejs.dev/linter/rules/lint/complexity/useLiteralKeys
function validatePriorityLevel(value: unknown): PriorityLevel | null {
	if (!value || typeof value !== "object") return null;

	const obj = value as { level?: unknown; name?: unknown; rules?: unknown };

	if (
		typeof obj.level !== "number" ||
		typeof obj.name !== "string" ||
		!Array.isArray(obj.rules)
	) {
		return null;
	}

	const normalizedRules = obj.rules
		.filter((r): r is string => typeof r === "string")
		.map((r) => r.toLowerCase());

	return {
		level: obj.level,
		name: obj.name,
		rules: normalizedRules,
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
		const parsed = JSON.parse(raw) as unknown;

		if (!parsed || typeof parsed !== "object") return null;
		const obj = parsed as { priorityLevels?: unknown };

		if (!Array.isArray(obj.priorityLevels)) {
			return null;
		}

		const validatedLevels: PriorityLevel[] = [];
		for (const level of obj.priorityLevels) {
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
