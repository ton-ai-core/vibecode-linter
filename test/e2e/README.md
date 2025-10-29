# E2E Tests Documentation

## Overview

Comprehensive end-to-end tests for the vibecode-linter that validate exact output format, cursor positioning, and error reporting with mathematical precision.

## Architecture

### FUNCTIONAL CORE, IMPERATIVE SHELL Pattern

- **CORE**: Pure validation functions in `test-utils.ts`
- **SHELL**: Test execution and caching layer

### Key Components

#### `test-utils.ts`
- `runLinterCached()` - Cached CLI execution to avoid repeated slow runs
- `parseErrorOutput()` - Structured parsing of linter output
- `parseSummary()` - Statistical validation of error counts
- `getCachedLinterResults()` - Single source of truth for test data

#### `linter-output.e2e.test.ts`
- 18 comprehensive test cases covering all aspects of linter output
- Mathematical invariants for exact validation
- Performance testing with caching validation

## Test Categories

### 1. Error Format Validation
- **Exact cursor positioning**: Validates `mixed-issues.ts:69:16` error format 1-to-1
- **Error structure consistency**: All 15 critical errors follow same format
- **Rule-specific validation**: `@typescript-eslint/no-explicit-any` violations

### 2. Summary Statistics Validation
- **Exact counts**: 274 total errors (0 TypeScript, 169 ESLint, 105 Biome)
- **Mathematical invariants**: Sum validation and distribution checks
- **Format pattern matching**: Unicode emoji and formatting consistency

### 3. Workflow Headers Validation
- **Stage indicators**: All workflow phases properly reported
- **Command execution**: Actual CLI commands shown with `↳` indicators
- **Completion status**: Success/warning indicators for each stage

### 4. Cursor Positioning Validation
- **Line context**: Sequential line numbers (67, 68, 69, 70)
- **Cursor indicators**: Proper `^^^` positioning under errors
- **Code context**: Exact source code display with line numbers

### 5. Performance & Caching
- **Sub-100ms cached execution**: Second runs are instant
- **Result consistency**: Cached results identical to original
- **Memory efficiency**: Single execution per test suite

### 6. Edge Cases
- **Unicode handling**: Proper emoji and symbol display
- **Internationalization**: Russian text in comments
- **Exit code consistency**: Always 1 when errors found

## Mathematical Invariants

```typescript
// INVARIANT: ∀ error ∈ Output: format(error) = expected_format ∧ cursor_position(error) = correct_position
// INVARIANT: Single execution per test suite, ∀ test: uses_same_cached_result
// INVARIANT: Sum of individual counts equals total: typescript + eslint + biome = total
// INVARIANT: Cached execution should be under 100ms
// INVARIANT: Context should show sequential line numbers
```

## Usage

```bash
# Run E2E tests
npm test -- test/e2e/linter-output.e2e.test.ts

# Or directly with Jest
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config jest.config.mjs test/e2e/linter-output.e2e.test.ts
```

## Performance

- **First run**: ~19 seconds (includes CLI execution)
- **Cached validation**: <100ms per test
- **Total tests**: 18 test cases
- **Coverage**: 100% of linter output format

## Test Data

Uses `e2e-test-project/src/` with intentionally broken TypeScript files:
- `mixed-issues.ts` - Multiple error types in one file
- `01-typescript-errors.ts` - TypeScript compiler errors
- `02-eslint-violations.ts` - ESLint rule violations
- `duplicate-code-*.ts` - Code duplication examples

## Validation Strategy

1. **Exact matching**: Error messages must match 1-to-1 (except file paths)
2. **Cursor precision**: Column positioning validated to exact character
3. **Format consistency**: All errors follow identical structure
4. **Statistical accuracy**: Error counts mathematically verified
5. **Performance bounds**: Execution time constraints enforced

This ensures the linter output is reliable, consistent, and user-friendly across all scenarios.