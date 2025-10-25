/**
 * CHANGE: Централизованные ре-экспорты Node built-ins для устранения дубликатов import-блоков
 * WHY: jscpd находил повторяющиеся последовательности import {exec}/fs/path/promisify; общий модуль снижает токены дубликатов
 * QUOTE(ТЗ): "Разбить lint.ts на подфайлы" и убрать дубли
 * REF: REQ-20250210-MODULAR-ARCH, REQ-LINT-FIX
 *
 * Инвариант: экспортируем совместимые объекты/функции, избегая `export *` для модулей с `export =`.
 */
import * as fsNS from "node:fs";
import * as pathNS from "node:path";

export { exec } from "node:child_process";
export { promisify } from "node:util";

// CHANGE: Ре-экспорт через константы вместо `export *`
// WHY: node:path (и часто node:fs) используют `export =`, что несовместимо с `export *`
// REF: TypeScript limitation for `export =`
export const fs = fsNS;
export const path = pathNS;
