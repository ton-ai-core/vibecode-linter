# E2E Test Project

Этот проект создан специально для демонстрации работы vibecode-linter с различными типами ошибок.

## 📁 Структура проекта

```
src/
├── typescript-errors.ts     # Ошибки TypeScript (TS2322, TS2339, TS2531, etc.)
├── eslint-errors.ts         # Нарушения правил ESLint
├── formatting-issues.ts     # Проблемы форматирования для Biome
├── duplicate-code-1.ts      # Дублированный код (часть 1)
├── duplicate-code-2.ts      # Дублированный код (часть 2)  
├── duplicate-code-3.ts      # Дублированный код (часть 3)
└── mixed-issues.ts          # Смешанные проблемы всех типов
```

## 🔍 Типы ошибок для демонстрации

### TypeScript ошибки
- **TS2322**: Type assignment errors
- **TS2339**: Property does not exist
- **TS2531**: Object is possibly null
- **TS2345**: Argument type mismatch
- **TS7006**: Implicit any parameter

### ESLint ошибки
- **no-var**: Использование var вместо const/let
- **prefer-const**: Переменные, которые должны быть const
- **@typescript-eslint/no-unused-vars**: Неиспользуемые переменные
- **@typescript-eslint/no-explicit-any**: Запрещённый any тип
- **no-console**: Console statements
- **curly**: Отсутствие фигурных скобок
- **eqeqeq**: Использование == вместо ===
- **no-unreachable**: Недостижимый код

### Biome проблемы
- Плохое форматирование отступов
- Неправильные пробелы
- Смешанные кавычки
- Длинные строки
- **useConst**: let вместо const
- **useTemplate**: Конкатенация вместо template literals

### Дубликаты кода
- Функция `validateUserInput` (в 2 файлах)
- Функция `formatDate` (в 2 файлах)
- Функция `handleHttpError` (в 3 файлах)
- Функция `logWithTimestamp` (в 3 файлах)

## 🚀 Как использовать

### Запуск линтера
```bash
# Из корня vibecode-linter проекта
npx tsx src/bin/vibecode-linter.ts e2e-test-project/src/

# Или с автофиксом
npx tsx src/bin/vibecode-linter.ts e2e-test-project/src/ --fix

# С показом дубликатов
npx tsx src/bin/vibecode-linter.ts e2e-test-project/src/ --duplicates

# Все опции сразу
npx tsx src/bin/vibecode-linter.ts e2e-test-project/src/ --fix --duplicates
```

### Использование npm скриптов
```bash
# Базовый линтинг
npm run test:e2e:demo

# С автофиксом
npm run test:e2e:fix

# С дубликатами
npm run test:e2e:duplicates

# Все опции
npm run test:e2e:all

# Полный E2E тест-сьют
npm run test:e2e
```

### Ожидаемые результаты

#### TypeScript ошибки (8+ ошибок)
```
[ERROR] typescript-errors.ts:5:27 TS2322 (TypeScript) — Type 'string' is not assignable to type 'number'
[ERROR] typescript-errors.ts:8:31 TS2322 (TypeScript) — Type 'undefined' is not assignable to type 'string'
[ERROR] mixed-issues.ts:5:35 TS2322 (TypeScript) — Type 'string' is not assignable to type 'number'
```

#### ESLint ошибки (15+ ошибок)
```
[ERROR] eslint-errors.ts:5:1 no-var (ESLint) — Unexpected var, use let or const instead
[ERROR] eslint-errors.ts:8:1 prefer-const (ESLint) — 'neverChanges' is never reassigned
[ERROR] mixed-issues.ts:5:1 no-var (ESLint) — Unexpected var, use let or const instead
```

#### Biome ошибки (10+ ошибок)
```
[ERROR] formatting-issues.ts:6:1 format (Biome) — Formatter would have printed the following content
[ERROR] mixed-issues.ts:8:1 useConst (Biome) — This let declaration is never reassigned
```

#### Дубликаты кода (4+ дубликата)
```
🔍 Code duplicates found:
├─ validateUserInput (2 locations, 12 lines)
├─ formatDate (2 locations, 6 lines)  
├─ handleHttpError (3 locations, 14 lines)
└─ logWithTimestamp (3 locations, 4 lines)
```

## 🎯 Цель проекта

Этот проект позволяет:

1. **Визуально увидеть** как отображаются разные типы ошибок
2. **Протестировать автофикс** на реальных примерах
3. **Проверить обнаружение дубликатов** кода
4. **Убедиться в работе конфигураций** (tsconfig.json, eslint.config.mjs, biome.json)
5. **Создать E2E тесты** с предсказуемыми результатами

## 📊 Ожидаемая статистика

- **Всего файлов**: 6
- **Строк кода**: ~300
- **TypeScript ошибок**: 8-12
- **ESLint ошибок**: 15-20  
- **Biome ошибок**: 10-15
- **Дубликатов кода**: 4-6
- **Exit code**: 1 (есть ошибки)

После автофикса:
- **ESLint ошибок**: 5-8 (некоторые исправлены)
- **Biome ошибок**: 0-2 (форматирование исправлено)
- **TypeScript ошибок**: 8-12 (не исправляются автоматически)