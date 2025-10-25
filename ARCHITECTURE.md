# Модульная Архитектура vibecode-linter

## Статус: В процессе реализации

### ✅ Завершенные модули

#### 1. `src/types/` - Определения типов (100%)
- `messages.ts` - Типы сообщений от линтеров (ESLint, TypeScript, Biome)
- `config.ts` - Типы конфигурации (CLI, приоритеты)
- `git.ts` - Типы для git операций
- `diff.ts` - Типы для парсинга diff
- `sarif.ts` - Типы для SARIF отчетов
- `index.ts` - Центральный экспорт

#### 2. `src/diff/` - Парсинг diff (100%)
- `parser.ts` - Извлечение фрагментов unified diff (~150 строк)
- `column.ts` - Конвертация визуальных колонок (~130 строк)
- `index.ts` - Экспорты

#### 3. `src/git/` - Git интеграция (100%)
- `utils.ts` - Вспомогательные функции (~110 строк)
- `diff.ts` - Получение git diff с подсветкой (~220 строк)
- `blame.ts` - Git blame для строки (~110 строк)
- `history.ts` - История изменений строки (~120 строк)
- `index.ts` - Экспорты

#### 4. `src/config/` - Конфигурация (100%)
- `cli.ts` - Парсинг аргументов командной строки (~50 строк)
- `loader.ts` - Загрузка linter.config.json (~75 строк)
- `index.ts` - Экспорты

### 📋 Оставшиеся модули

#### 5. `src/linters/` - Запуск линтеров (TODO)
Необходимо создать:
- `eslint.ts` - runESLintFix(), getESLintResults() (~150 строк)
- `biome.ts` - runBiomeFix(), getBiomeDiagnostics(), parseBiomeOutput() (~200 строк)
- `typescript.ts` - getTypeScriptDiagnostics(), filterMessagesByPath() (~100 строк)
- `index.ts` - Экспорты

Извлечь из `lint.ts`:
- Строки 1026-1056: runESLintFix()
- Строки 1058-1073: runBiomeFix()
- Строки 1078-1134: getTypeScriptDiagnostics()
- Строки 1139-1166: filterMessagesByPath()
- Строки 1289-1360: getESLintResults()
- Строки 1362-1447: getBiomeDiagnostics()
- Строки 1449-1556: parseBiomeOutput()

#### 6. `src/analysis/` - Анализ зависимостей (TODO)
Необходимо создать:
- `dependencies.ts` - __buildProgram(), __buildEdges(), __topoRank() (~180 строк)
- `index.ts` - Экспорты

Извлечь из `lint.ts`:
- Строки 335-475: Весь блок "Dependency-based ordering helpers"

#### 7. `src/output/` - Вывод результатов (TODO)
Необходимо создать:
- `printer.ts` - processResults(), форматирование вывода (~250 строк)
- `duplicates.ts` - generateSarifReport(), parseSarifReport(), displayClonesFromSarif() (~150 строк)
- `index.ts` - Экспорты

Извлечь из `lint.ts`:
- Строки 1196-1227: generateSarifReport()
- Строки 1229-1284: parseSarifReport()
- Строки 1558-1657: processResults() (начало)
- Строки 1658-1813: processResults() (продолжение - printer)
- Строки 1815-1893: displayClonesFromSarif()

#### 8. `src/main.ts` - Главная логика (TODO)
Необходимо создать:
- Главную async функцию из lint.ts (строки 1173-1194)
- Координация всех модулей
- Обработка ошибок

#### 9. Точка входа (✅ Реализовано)
Архитектура entry points:
- **CLI**: `src/bin/vibecode-linter.ts` (единственное место с process.exit)
- **Library API**: `src/index.ts` (экспортирует runLinter и типы)
- **Orchestration**: `src/app/runLinter.ts` (координация CORE + SHELL)

```typescript
// Programmatic usage:
import { runLinter } from '@ton-ai-core/vibecode-linter';

await runLinter({
  targetPath: 'src/',
  noFix: false,
  // ... options
});
```

## Граф зависимостей модулей

```
lint.ts
  └── src/main.ts
       ├── src/config/* (CLI, конфигурация)
       ├── src/linters/* (ESLint, Biome, TypeScript)
       │   └── src/types/messages
       ├── src/analysis/dependencies
       │   └── src/types/messages
       ├── src/output/printer
       │   ├── src/git/* (diff, blame, history)
       │   │   ├── src/diff/* (парсинг diff)
       │   │   └── src/types/git
       │   ├── src/types/messages
       │   └── src/analysis/dependencies
       └── src/output/duplicates
           └── src/types/sarif
```

## Следующие шаги

### 1. Создать модули linters
```bash
# Создать файлы
touch src/linters/{eslint,biome,typescript,index}.ts

# Скопировать код из lint.ts с корректными импортами
```

### 2. Создать модули analysis
```bash
# Создать файлы
touch src/analysis/{dependencies,index}.ts

# Скопировать TypeScript AST анализ из lint.ts
```

### 3. Создать модули output
```bash
# Создать файлы
touch src/output/{printer,duplicates,index}.ts

# Разделить processResults и SARIF логику
```

### 4. Создать main.ts
```bash
# Создать главный файл
touch src/main.ts

# Перенести главную async функцию и координацию
```

### 5. Обновить lint.ts
```bash
# Сделать точкой входа, импортирующей src/main.ts
```

### 6. Тестирование
```bash
# Запустить линтер
npm run lint

# Проверить работу
./lint.ts .
```

## Преимущества новой архитектуры

✅ **Модульность**: Каждый файл < 300 строк
✅ **Тестируемость**: Независимое тестирование модулей
✅ **Maintainability**: Логически связанный код сгруппирован
✅ **Type Safety**: Строгая типизация без `any`
✅ **Clear Contracts**: TSDoc для всех публичных API
✅ **Dependency Injection**: Чистые функции

## Инварианты

1. **Типы** (`src/types/*`): Без зависимостей, только интерфейсы
2. **Diff** (`src/diff/*`): Чистые функции с pre/post условиями
3. **Git** (`src/git/*`): Async функции, возвращают null при ошибках
4. **Config** (`src/config/*`): Синхронная загрузка конфигурации
5. **Linters** (`src/linters/*`): Async запуск, возвращают массивы сообщений
6. **Analysis** (`src/analysis/*`): TypeScript Program + топологическая сортировка
7. **Output** (`src/output/*`): Async печать с форматированием
8. **Main** (`src/main.ts`): Координация модулей, обработка ошибок
