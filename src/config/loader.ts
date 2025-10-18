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

import type { LinterConfig, PriorityLevel } from "../types/index";

/**
 * Type representing any valid JSON value.
 *
 * @invariant Must be serializable to JSON
 */
type JSONValue =
	| string
	| number
	| boolean
	| null
	| ReadonlyArray<JSONValue>
	| { readonly [key: string]: JSONValue };

/**
 * Type guard to check if value is a JSON object.
 *
 * @param value Value to check
 * @returns True if value is a non-null object
 */
function isJSONObject(
	value: JSONValue,
): value is { readonly [key: string]: JSONValue } {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Type guard to check if value is a string.
 *
 * @param value Value to check
 * @returns True if value is a string
 */
function isString(value: JSONValue): value is string {
	return typeof value === "string";
}

/**
 * Type guard to check if value is a number.
 *
 * @param value Value to check
 * @returns True if value is a number
 */
function isNumber(value: JSONValue): value is number {
	return typeof value === "number";
}

/**
 * Type guard to check if value is an array.
 *
 * @param value Value to check
 * @returns True if value is an array
 */
function isArray(value: JSONValue): value is ReadonlyArray<JSONValue> {
	return Array.isArray(value);
}

/**
 * Type representing a priority level object from JSON.
 */
type PriorityLevelJSON = {
	readonly level: JSONValue;
	readonly name: JSONValue;
	readonly rules: JSONValue;
};

/**
 * Type guard to check if value is a PriorityLevelJSON object.
 *
 * @param value Value to check
 * @returns True if value has required priority level fields
 */
function isPriorityLevelJSON(value: JSONValue): value is PriorityLevelJSON {
	return (
		isJSONObject(value) &&
		"level" in value &&
		"name" in value &&
		"rules" in value
	);
}

/**
 * Валидирует и нормализует уровень приоритета.
 *
 * @param value Значение для валидации
 * @returns Нормализованный уровень приоритета или null
 *
 * @invariant value должен быть объектом с полями level, name, rules
 */
function validatePriorityLevel(value: JSONValue): PriorityLevel | null {
	if (!isPriorityLevelJSON(value)) {
		return null;
	}

	const level = value.level;
	const name = value.name;
	const rules = value.rules;

	if (!isNumber(level) || !isString(name) || !isArray(rules)) {
		return null;
	}

	const normalizedRules = rules
		.filter((r): r is string => isString(r))
		.map((r) => r.toLowerCase());

	return {
		level,
		name,
		rules: normalizedRules,
	};
}

/**
 * Загружает конфигурацию линтера из файла linter.config.json.
 *
 * @param configPath Путь к файлу конфигурации
 * @returns Конфигурация линтера или null при ошибке
 *
 * @invariant configPath должен указывать на валидный JSON файл
 */
/**
 * Type representing the config JSON structure.
 */
type ConfigJSON = {
	readonly priorityLevels: JSONValue;
};

/**
 * Type guard to check if value is a ConfigJSON object.
 *
 * @param value Value to check
 * @returns True if value has priorityLevels field
 */
function isConfigJSON(value: JSONValue): value is ConfigJSON {
	return isJSONObject(value) && "priorityLevels" in value;
}

export function loadLinterConfig(
	configPath = path.resolve(process.cwd(), "linter.config.json"),
): LinterConfig | null {
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const parsed = JSON.parse(raw) as JSONValue;

		if (!isConfigJSON(parsed)) {
			return null;
		}

		const priorityLevels = parsed.priorityLevels;
		if (!isArray(priorityLevels)) {
			return null;
		}

		const validatedLevels: PriorityLevel[] = [];
		for (const level of priorityLevels) {
			const validated = validatePriorityLevel(level);
			if (validated) {
				validatedLevels.push(validated);
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
 * Результат создания карты правил с поддержкой "all".
 */
export interface RuleLevelMap {
	readonly explicitRules: Map<string, { level: number; name: string }>;
	readonly allLevel: { level: number; name: string } | null;
}

/**
 * Создает карту правил с их уровнями приоритета.
 * Поддерживает специальное значение "all" для указания "все правила кроме явно перечисленных".
 *
 * @param cfg Конфигурация линтера
 * @returns Объект с картой явных правил и уровнем "all"
 *
 * @example
 * // Конфиг:
 * {
 *   priorityLevels: [
 *     {level: 1, rules: ["error1", "error2"]},
 *     {level: 2, rules: ["all"]},  // Все кроме error1, error2, error3
 *     {level: 3, rules: ["error3"]}
 *   ]
 * }
 * // Результат:
 * // error1 → level 1
 * // error2 → level 1
 * // error3 → level 3
 * // все остальные → level 2 (from "all")
 */
export function makeRuleLevelMap(cfg: LinterConfig): RuleLevelMap {
	// CHANGE: Support "all" keyword to match all rules except explicitly listed ones
	// WHY: User wants flexible priority system where "all" acts as catch-all for unlisted rules
	// QUOTE(USER): "чем больше ошибок будет описано тем больше они не отображаются на уровне all"
	// REF: user-request-all-keyword
	// SOURCE: n/a
	const explicitRules = new Map<string, { level: number; name: string }>();
	let allLevel: { level: number; name: string } | null = null;

	// Collect all explicit rules and find "all" level
	for (const pl of cfg.priorityLevels) {
		for (const r of pl.rules) {
			if (r === "all") {
				// Remember first "all" occurrence
				if (!allLevel) {
					allLevel = { level: pl.level, name: pl.name };
				}
			} else {
				// Collect explicit rule
				explicitRules.set(r, { level: pl.level, name: pl.name });
			}
		}
	}

	return { explicitRules, allLevel };
}
