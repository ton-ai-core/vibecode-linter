// CHANGE: Extracted configuration type definitions from lint.ts
// WHY: Configuration types should be in a separate module for better organization
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Уровень приоритета для правил линтера.
 *
 * @property level Числовой уровень приоритета (меньше = выше приоритет)
 * @property name Название уровня (например, "Critical")
 * @property rules Список идентификаторов правил для данного уровня
 */
export interface PriorityLevel {
	readonly level: number;
	readonly name: string;
	readonly rules: ReadonlyArray<string>;
}

/**
 * Конфигурация линтера из linter.config.json.
 *
 * @property priorityLevels Список уровней приоритета
 */
export interface LinterConfig {
	readonly priorityLevels: ReadonlyArray<PriorityLevel>;
}

/**
 * Опции командной строки для lint.ts.
 *
 * @property targetPath Путь к файлу или директории для проверки
 * @property maxClones Максимальное количество дубликатов для отображения
 * @property width Ширина терминала для форматирования
 * @property context Количество строк контекста для diff (зарезервировано)
 * @property noFix Флаг отключения автоисправлений
 */
export interface CLIOptions {
	readonly targetPath: string;
	readonly maxClones: number;
	readonly width: number;
	readonly context?: number;
	readonly noFix: boolean;
	readonly noPreflight: boolean;
	readonly fixPeers: boolean;
}

/**
 * Тип ошибки при выполнении команды с доступом к stdout/stderr.
 *
 * @property stdout Стандартный вывод команды
 * @property stderr Стандартный вывод ошибок
 */
export interface ExecError extends Error {
	readonly stdout?: string;
	readonly stderr?: string;
}
