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
 * Сообщение об ошибке от ESLint.
 */
export interface ESLintMessage extends BaseLintMessage {
	readonly ruleId: string | null;
	readonly source: "eslint";
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
 * Сообщение об ошибке от Biome.
 */
export interface BiomeMessage extends BaseLintMessage {
	readonly ruleId: string | null;
	readonly source: "biome";
}

/**
 * Объединенный тип сообщения от любого линтера.
 */
export type LintMessage = ESLintMessage | TypeScriptMessage | BiomeMessage;

/**
 * Расширенный тип сообщения с путем к файлу.
 */
export type LintMessageWithFile = LintMessage & { readonly filePath: string };

/**
 * Результат работы линтера для одного файла.
 * Используется как базовый тип для ESLintResult, BiomeResult и др.
 */
export interface LintResult {
	readonly filePath: string;
	readonly messages: ReadonlyArray<
		BaseLintMessage & { readonly ruleId: string | null }
	>;
}
