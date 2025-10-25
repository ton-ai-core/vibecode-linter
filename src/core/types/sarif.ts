// CHANGE: Extracted SARIF-related type definitions from lint.ts
// WHY: SARIF types for duplicate detection should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Локация в SARIF формате.
 *
 * @property physicalLocation Физическое расположение в файле
 */
export interface SarifLocation {
	readonly physicalLocation: {
		readonly artifactLocation: {
			readonly uri: string;
		};
		readonly region: {
			readonly startLine: number;
			readonly startColumn?: number;
			readonly endLine: number;
			readonly endColumn?: number;
		};
	};
}

/**
 * Результат проверки в SARIF формате.
 *
 * @property locations Локации, где обнаружена проблема
 * @property relatedLocations Связанные локации
 * @property message Сообщение о проблеме
 */
export interface SarifResult {
	readonly locations: ReadonlyArray<SarifLocation>;
	readonly relatedLocations: ReadonlyArray<SarifLocation>;
	readonly message: {
		readonly text: string;
	};
}

/**
 * SARIF отчет от jscpd.
 *
 * @property runs Массив запусков анализа
 */
export interface SarifReport {
	readonly runs: ReadonlyArray<{
		readonly results: ReadonlyArray<SarifResult>;
	}>;
}

/**
 * Информация о дубликате кода.
 *
 * @property fileA Путь к первому файлу
 * @property fileB Путь ко второму файлу
 * @property startA Начальная строка в первом файле
 * @property endA Конечная строка в первом файле
 * @property startB Начальная строка во втором файле
 * @property endB Конечная строка во втором файле
 */
export interface DuplicateInfo {
	readonly fileA: string;
	readonly fileB: string;
	readonly startA: number;
	readonly endA: number;
	readonly startB: number;
	readonly endB: number;
}
