// CHANGE: Created types for Biome diagnostic output
// WHY: Strict typing without any/unknown
// QUOTE(ТЗ): "Никогда не использовать `any`, `unknown`"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

/**
 * Структура диагностического сообщения Biome.
 */
export interface BiomeDiagnostic {
	readonly severity: "error" | "warning" | "information";
	readonly category?: string;
	readonly description?: string;
	readonly title?: string;
	readonly message?: string | readonly BiomeMessagePart[];
	readonly location?: BiomeLocation;
}

/**
 * Часть сообщения Biome.
 */
export interface BiomeMessagePart {
	readonly content?: string;
}

/**
 * Местоположение в файле.
 */
export interface BiomeLocation {
	readonly path?: BiomePath;
	readonly span?: BiomeSpan | readonly [number, number];
}

/**
 * Путь к файлу.
 */
export interface BiomePath {
	readonly file?: string;
}

/**
 * Диапазон в файле (байтовые смещения).
 */
export interface BiomeSpan {
	readonly start: number;
	readonly end?: number;
}

/**
 * Корневой объект вывода Biome.
 */
export interface BiomeOutput {
	readonly diagnostics?: readonly BiomeDiagnostic[];
}
