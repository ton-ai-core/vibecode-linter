// CHANGE: Extracted message type definitions with unified base interfaces
// WHY: DRY principle - eliminates all structural duplicates
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Базовый интерфейс для всех lint-сообщений.
 */
interface BaseLintMessage {
	readonly severity: number;
	readonly message: string;
	readonly line: number;
	readonly column: number;
	readonly endLine?: number;
	readonly endColumn?: number;
}

/**
 * Сообщение об ошибке от ESLint с файлом.
 *
 * CHANGE: Added filePath to ESLintMessage directly
 * WHY: Avoid type intersection conflicts in LintMessageWithFile
 * QUOTE(ERROR): "Unsafe member access on error typed value"
 * REF: ESLint @typescript-eslint/no-unsafe-member-access
 */
export interface ESLintMessage extends BaseLintMessage {
	readonly ruleId: string | null;
	readonly source: "eslint";
	readonly filePath: string;
}

/**
 * Сообщение об ошибке от TypeScript компилятора.
 */
export interface TypeScriptMessage extends BaseLintMessage {
	readonly code: string;
	readonly source: "typescript";
	readonly filePath: string;
}

/**
 * Сообщение об ошибке от Biome с файлом.
 *
 * CHANGE: Added filePath to BiomeMessage directly
 * WHY: Avoid type intersection conflicts in LintMessageWithFile
 * QUOTE(ERROR): "Unsafe member access on error typed value"
 * REF: ESLint @typescript-eslint/no-unsafe-member-access
 */
export interface BiomeMessage extends BaseLintMessage {
	readonly ruleId: string | null;
	readonly source: "biome";
	readonly filePath: string;
}

/**
 * Объединенный тип сообщения от любого линтера.
 *
 * CHANGE: Removed separate LintMessage type, use LintMessageWithFile directly
 * WHY: All messages always have filePath in practice, no need for two types
 * QUOTE(ТЗ): "Давать проверяемые решения через формализацию"
 * REF: Type safety requirements
 */
export type LintMessage = ESLintMessage | TypeScriptMessage | BiomeMessage;

/**
 * Расширенный тип сообщения с путем к файлу.
 *
 * CHANGE: Now just an alias since all message types have filePath
 * WHY: Eliminates type intersection that was causing "error" types
 * QUOTE(ERROR): "Type acts as 'any' and overrides all other types"
 * REF: ESLint @typescript-eslint/no-redundant-type-constituents
 */
export type LintMessageWithFile = LintMessage;

/**
 * Type guards for narrowing LintMessage variants.
 *
 * CHANGE: Added type guards to help TypeScript narrow union types
 * WHY: ESLint complains about unsafe member access without type guards
 * QUOTE(ERROR): "Unsafe member access on error typed value"
 * @pure true
 * @invariant result === (message.source === "typescript")
 * @complexity O(1)
 * REF: ESLint @typescript-eslint/no-unsafe-member-access
 */
export function isTypeScriptMessage(
	message: LintMessage,
): message is TypeScriptMessage {
	return message.source === "typescript";
}

/**
 * Проверяет, является ли сообщение ESLint сообщением
 *
 * @pure true
 * @invariant result === (message.source === "eslint")
 * @complexity O(1)
 */
export function isESLintMessage(
	message: LintMessage,
): message is ESLintMessage {
	return message.source === "eslint";
}

/**
 * Проверяет, является ли сообщение Biome сообщением
 *
 * @pure true
 * @invariant result === (message.source === "biome")
 * @complexity O(1)
 */
export function isBiomeMessage(message: LintMessage): message is BiomeMessage {
	return message.source === "biome";
}

/**
 * Результат работы линтера для одного файла.
 * Используется как базовый тип для ESLintResult, BiomeResult и др.
 *
 * CHANGE: Updated messages type to use BaseLintMessage with ruleId
 * WHY: Messages from linters don't have source field yet (added in main.ts)
 * QUOTE(ERROR): "Type acts as 'any' and overrides all other types"
 * REF: ESLint @typescript-eslint/no-redundant-type-constituents
 */
export interface LintResult {
	readonly filePath: string;
	readonly messages: ReadonlyArray<
		BaseLintMessage & { readonly ruleId: string | null }
	>;
}
