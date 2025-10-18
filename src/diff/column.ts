// CHANGE: Extracted column calculation functions from lint.ts
// WHY: Column conversion logic should be in a separate module for better testability
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Размер табуляции по умолчанию (как в git diff и ESLint).
 */
export const TAB_WIDTH = 8;

/**
 * Конвертирует визуальную колонку (как в ESLint) в реальный индекс символа.
 *
 * ESLint и git diff считают табуляцию как 8 пробелов, но в строке это один символ.
 * Эта функция преобразует визуальную позицию в реальный индекс в строке.
 *
 * @param lineContent Строка исходного кода без diff-префикса
 * @param visualColumn Визуальная колонка (0-based)
 * @param tabSize Размер табуляции; по умолчанию 8, как в git diff и ESLint
 * @returns Реальный индекс символа (0-based)
 *
 * @invariant visualColumn >= 0
 *
 * @example
 * ```ts
 * // Строка: "x\ty" (x, tab, y)
 * // Визуально: "x       y" (x, 7 spaces, y)
 * const realIndex = computeRealColumnFromVisual("x\ty", 8, 8);
 * // Returns 2 (индекс символа 'y')
 * ```
 */
export function computeRealColumnFromVisual(
	lineContent: string,
	visualColumn: number,
	tabSize = TAB_WIDTH,
): number {
	// CHANGE: Precondition check for visualColumn
	// WHY: Ensures we only work with valid column positions
	// QUOTE(SPEC): "visualColumn must be non-negative"
	// REF: REQ-20250210-MODULAR-ARCH
	// SOURCE: n/a
	if (visualColumn < 0) {
		throw new Error(
			`visualColumn must be non-negative, received ${visualColumn}`,
		);
	}

	let realColumn = 0;
	let currentVisual = 0;

	for (let index = 0; index <= lineContent.length; index += 1) {
		if (currentVisual === visualColumn) {
			realColumn = index;
			break;
		}

		if (currentVisual > visualColumn) {
			realColumn = index;
			break;
		}

		if (index >= lineContent.length) {
			realColumn = lineContent.length;
			break;
		}

		const char = lineContent[index];
		if (char === "\t") {
			const nextTabStop = Math.floor(currentVisual / tabSize + 1) * tabSize;
			if (nextTabStop >= visualColumn) {
				currentVisual = nextTabStop;
				realColumn = index + 1;
				break;
			}
			currentVisual = nextTabStop;
		} else {
			currentVisual += 1;
		}
	}

	return realColumn;
}

/**
 * Вычисляет визуальную позицию колонки с учетом табуляции.
 *
 * @param content Строка исходного кода
 * @param index Индекс символа в строке (0-based)
 * @param tabWidth Размер табуляции
 * @returns Визуальная колонка (0-based)
 *
 * @example
 * ```ts
 * // Строка: "x\ty" (x, tab, y)
 * const visual = visualColumnAt("x\ty", 2, 8);
 * // Returns 8 (визуальная позиция 'y')
 * ```
 */
export function visualColumnAt(
	content: string,
	index: number,
	tabWidth = TAB_WIDTH,
): number {
	let column = 0;
	const limit = Math.max(0, Math.min(index, content.length));
	for (let i = 0; i < limit; i += 1) {
		const ch = content[i];
		if (ch === "\t") {
			const offset = tabWidth - (column % tabWidth);
			column += offset;
		} else {
			column += 1;
		}
	}
	return column;
}

/**
 * Раскрывает табуляцию в строке в пробелы.
 *
 * @param content Строка исходного кода с табуляцией
 * @param tabWidth Размер табуляции
 * @returns Строка с раскрытыми табуляциями
 *
 * @example
 * ```ts
 * const expanded = expandTabs("x\ty", 8);
 * // Returns "x       y" (x, 7 spaces, y)
 * ```
 */
export function expandTabs(content: string, tabWidth = TAB_WIDTH): string {
	let column = 0;
	let result = "";
	for (const ch of content) {
		if (ch === "\t") {
			const spaces = tabWidth - (column % tabWidth);
			result += " ".repeat(spaces);
			column += spaces;
		} else {
			result += ch;
			column += 1;
		}
	}
	return result;
}
