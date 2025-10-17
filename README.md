# vibecode-linter

TypeScript консольный проект с строгой типизацией, линтингом и тестированием.

## Требования

- Node.js >= 18.0.0
- npm

## Установка

```bash
npm install
```

## Команды

### Разработка

```bash
# Запуск в dev режиме с tsx
npm run dev

# Сборка проекта
npm run build

# Запуск скомпилированного проекта
npm start
```

### Линтинг и форматирование

```bash
# ESLint проверка
npm run lint

# ESLint автоисправление
npm run lint:fix

# Biome форматирование
npm run format

# Biome проверка форматирования
npm run format:check

# Biome полная проверка и автоисправление
npm run check

# Biome проверка для CI
npm run check:ci
```

### Тестирование

```bash
# Запуск тестов
npm test

# Тесты в watch режиме
npm run test:watch

# Тесты с покрытием кода
npm run test:coverage
```

### Очистка

```bash
# Удаление сборки и покрытия
npm clean
```

## Архитектура

Проект следует функциональной парадигме с строгой типизацией:

- **Никогда не используется**: `any`, `unknown`, `ts-ignore`, `eslint-disable`
- **Строгие настройки TypeScript**: все strict флаги включены
- **ESLint**: конфигурация с множеством плагинов для качества кода
- **Biome**: быстрый форматтер и линтер
- **Jest**: тестирование с покрытием ≥80%
- **Функциональный стиль**: иммутабельность, чистые функции

## Структура проекта

```
vibecode-linter/
├── src/
│   ├── index.ts           # Главный файл приложения
│   └── index.test.ts      # Тесты для index.ts
├── dist/                  # Скомпилированный код (генерируется)
├── coverage/              # Отчеты о покрытии (генерируется)
├── .clinerules/           # Правила проекта
│   └── CLINE.md
├── biome.json            # Конфигурация Biome
├── eslint.config.mts     # Конфигурация ESLint
├── jest.config.ts        # Конфигурация Jest
├── tsconfig.json         # Конфигурация TypeScript
├── RTM.md                # Requirements Traceability Matrix
└── package.json          # Зависимости и скрипты
```

## Правила кодирования

### 1. Строгая типизация

```typescript
// ✅ Правильно
export function sum(numbers: readonly number[]): number {
  return numbers.reduce((acc, num) => acc + num, 0);
}

// ❌ Неправильно - использование any
function bad(data: any): any {
  return data;
}
```

### 2. Рациональные комментарии

Каждое изменение должно иметь комментарий:

```typescript
// CHANGE: <краткое описание>
// WHY: <почему изменено>
// QUOTE(TЗ): "<цитата из требований>"
// REF: <REQ-ID из RTM>
// SOURCE: <ссылка, если использован внешний источник>
```

### 3. TSDoc для публичных API

```typescript
/**
 * Calculates the sum of an array of numbers.
 * 
 * @param numbers - Array of numbers to sum
 * @returns The sum of all numbers
 * 
 * @invariant Result equals the mathematical sum of all input elements
 * @complexity O(n) time, O(1) space where n is the length of the array
 * 
 * @example
 * ```typescript
 * sum([1, 2, 3]); // returns 6
 * sum([]); // returns 0
 * ```
 */
export function sum(numbers: readonly number[]): number {
  return numbers.reduce((acc, num) => acc + num, 0);
}
```

### 4. Conventional Commits

```bash
# Формат коммита
type(scope): description

[optional body]

[optional footer]

# Примеры
feat(core): add sum function
fix(tests): correct floating point assertion
docs(readme): update installation instructions
```

## Тестирование

Все тесты должны:

- Иметь REF комментарий с ссылкой на REQ-ID
- Покрывать граничные случаи
- Проверять инварианты
- Тестировать иммутабельность

Пример теста:

```typescript
it('should return 0 for empty array', () => {
  // CHANGE: Test boundary condition
  // WHY: Verify invariant holds for empty input
  // REF: REQ-003
  const result: number = sum([]);
  expect(result).toBe(0);
});
```

## Верификация

Перед коммитом убедитесь что проходят:

```bash
npm run lint  # Должно быть 0 ошибок
npm test      # Все тесты должны пройти с покрытием ≥80%
```

## Requirements Traceability Matrix (RTM)

См. [RTM.md](./RTM.md) для полной матрицы отслеживания требований.

## Лицензия

MIT

## Автор

vibecode-linter team
