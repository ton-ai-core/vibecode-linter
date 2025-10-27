// CHANGE: Extracted diff-related type definitions from lint.ts
// WHY: Diff parsing types should be in a separate module for better organization
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Символ unified diff.
 */
export type DiffSymbol = "+" | "-" | " " | "@" | "\\" | undefined;

/**
 * Строка фрагмента unified diff со сведениями о символе и линии в HEAD.
 *
 * @property raw Полный текст строки diff с префиксом
 * @property symbol Символ diff (`+`, `-`, ` `, `@` или `\`)
 * @property headLineNumber Номер строки в HEAD или null, если строка удалена
 * @property content Содержимое без префикса diff
 */
export interface DiffLineView {
	readonly raw: string;
	readonly symbol: DiffSymbol;
	readonly headLineNumber: number | null;
	readonly content: string;
}

/**
 * Фрагмент diff с выделенной строкой HEAD.
 *
 * @property header Заголовок хунка (строка `@@ ... @@`)
 * @property lines Строки фрагмента после заголовка
 * @property pointerIndex Индекс строки в массиве lines, на которую указывает целевая HEAD-линия
 */
export interface DiffSnippet {
	readonly header: string;
	readonly lines: readonly DiffLineView[];
	readonly pointerIndex: number | null;
}

/**
 * Выбранный фрагмент diff с дескриптором.
 *
 * @property snippet Фрагмент diff
 * @property descriptor Описание источника diff (например, "workspace", "index")
 */
export interface DiffSnippetSelection {
	readonly snippet: DiffSnippet;
	readonly descriptor: string;
}
