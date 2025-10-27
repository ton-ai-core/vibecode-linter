// CHANGE: Extracted git-related type definitions from lint.ts
// WHY: Git types should be in a separate module for better organization
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Конфигурация диапазона для git diff.
 *
 * @property diffArg Аргумент для команды git diff
 * @property label Метка для отображения (например, "origin/main...HEAD")
 */
export interface DiffRangeConfig {
	readonly diffArg: string;
	readonly label: string;
}

/**
 * Блок git diff с форматированием и подсветкой.
 *
 * @property heading Заголовок блока
 * @property lines Отформатированные строки diff
 * @property footer Подвал блока
 * @property headLineNumbers Набор номеров строк из HEAD, которые присутствуют в diff
 */
export interface GitDiffBlock {
	readonly heading: string;
	readonly lines: readonly string[];
	readonly footer: string;
	readonly headLineNumbers: ReadonlySet<number>;
}

/**
 * Опции для получения git blame.
 *
 * @property historyCount Количество коммитов в истории (для отображения)
 * @property fallbackSnippet Фрагмент кода на случай, если не удалось получить из коммита
 */
export interface GitBlameOptions {
	readonly historyCount?: number;
	readonly fallbackSnippet?: readonly string[];
}

/**
 * Результат git blame для строки.
 *
 * @property lines Отформатированные строки с информацией о blame
 * @property commitHash Полный хэш коммита или null
 * @property shortHash Короткий хэш коммита или null
 */
export interface GitBlameResult {
	readonly lines: readonly string[];
	readonly commitHash: string | null;
	readonly shortHash: string | null;
}

/**
 * Блок истории git для строки.
 *
 * @property lines Отформатированные строки с информацией об истории
 * @property totalCommits Общее количество коммитов, затронувших строку
 * @property latestSnippet Фрагмент кода из последнего коммита (опционально)
 */
export interface GitHistoryBlock {
	readonly lines: readonly string[];
	readonly totalCommits: number;
	readonly latestSnippet?: readonly string[];
}
