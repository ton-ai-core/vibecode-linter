// CHANGE: Introduce project insight domain types
// WHY: Need immutable data models for metrics/tree reporting to stay in CORE
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: ∀snapshot: ProjectSnapshot → CORE never mutates referenced objects
// PURITY: CORE
// INVARIANT: All aggregations derived from immutable metrics inputs
// COMPLEXITY: O(1) - type declarations only

/**
 * Метрики содержимого файла.
 *
 * @property lines Количество логических строк (разделитель CRLF/CR)
 * @property characters Количество UTF-16 code units
 * @property functions Количество FunctionLike деклараций
 */
export interface FileContentMetrics {
	readonly lines: number;
	readonly characters: number;
	readonly functions: number;
}

/**
 * Входные данные о файле для построения дерева проекта.
 *
 * @property relativePath Путь относительно корня с разделителем "/"
 * @property sizeBytes Размер файла в байтах
 * @property extension Расширение (например, ".ts")
 * @property metrics Метрики содержимого
 */
export interface ProjectFileRecord {
	readonly relativePath: string;
	readonly sizeBytes: number;
	readonly extension: string;
	readonly metrics: FileContentMetrics;
}

/**
 * Агрегированные метрики проекта.
 *
 * @property lines Сумма строк по всем файлам
 * @property characters Сумма символов
 * @property functions Сумма функций
 * @property fileCount Количество файлов
 * @property directoryCount Количество директорий
 * @property sizeBytes Общий размер файлов
 */
export interface ProjectAggregateMetrics extends FileContentMetrics {
	readonly fileCount: number;
	readonly directoryCount: number;
	readonly sizeBytes: number;
}

/**
 * Узел дерева проекта.
 */
export type ProjectTreeNode = ProjectTreeDirectory | ProjectTreeFile;

/**
 * Файл в дереве проекта.
 *
 * @property kind Маркер "file"
 * @property name Имя файла без пути
 * @property relativePath Путь от корня
 * @property sizeBytes Размер файла
 * @property metrics Метрики содержимого
 */
export interface ProjectTreeFile {
	readonly kind: "file";
	readonly name: string;
	readonly relativePath: string;
	readonly sizeBytes: number;
	readonly metrics: FileContentMetrics;
}

/**
 * Директория в дереве проекта.
 *
 * @property kind Маркер "directory"
 * @property name Имя директории
 * @property relativePath Путь от корня
 * @property entries Отсортированные дочерние элементы
 * @property metrics Суммарные метрики
 * @property fileCount Количество файлов в поддереве
 * @property directoryCount Количество дочерних директорий в поддереве (включая текущую)
 * @property sizeBytes Общий размер файлов в поддереве
 */
export interface ProjectTreeDirectory {
	readonly kind: "directory";
	readonly name: string;
	readonly relativePath: string;
	readonly entries: ReadonlyArray<ProjectTreeNode>;
	readonly metrics: FileContentMetrics;
	readonly fileCount: number;
	readonly directoryCount: number;
	readonly sizeBytes: number;
}

/**
 * Snapshot проекта — корневой узел + агрегаты.
 *
 * @property root Корневая директория
 * @property totals Глобальные агрегаты
 */
export interface ProjectSnapshot {
	readonly root: ProjectTreeDirectory;
	readonly totals: ProjectAggregateMetrics;
}

/**
 * Опции форматирования дерева.
 *
 * @property includeSize Показывать ли размер файлов
 */
export interface TreeFormatOptions {
	readonly includeSize: boolean;
}

/**
 * Категория изменения файла в git.
 */
export type FileChangeCategory = "modified" | "untracked";

/**
 * Информация об изменении конкретного файла.
 *
 * @property statusLabel Короткий статус (M, A, D, ??)
 * @property category Категория (modified/untracked)
 * @property additions Количество добавленных строк (>=0)
 * @property deletions Количество удалённых строк (>=0)
 */
export interface FileChangeInfo {
	readonly statusLabel: string;
	readonly category: FileChangeCategory;
	readonly additions: number;
	readonly deletions: number;
	readonly isDirectory: boolean;
}
