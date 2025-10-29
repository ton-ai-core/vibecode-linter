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

# Or directly with Vitest
npx vitest run test/e2e/linter-output.e2e.test.ts
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

## E2E Test Isolation

### Problem

The linter displays git diff context in its output. When E2E tests run on files tracked in the main repository, the git status affects the output:

```
Main Repo: git status (dirty, ahead 1 commit)
  └─ e2e-test-project/ (no own .git)
       ↓
  Linter → git diff origin/main...HEAD
       ↓
  Different output on each commit ❌
```

### Solution: Isolated Git Repository

E2E tests run on an **isolated temporary copy** with its own git repository:

**Architecture**:
- **Source**: `e2e-test-project/` (tracked in main git repo)
- **Test execution**: Isolated copy in `.e2e/isolated-<random>/`
- **Git context**: Isolated git repo with deterministic author/date
- **Environment**: Fixed locale (`LANG=en_US.UTF-8`, `TZ=UTC`)
- **Output normalization**: ANSI stripped, paths normalized to `src/`

**How it works**:
1. On first test, `createIsolatedE2EProject()` creates a temporary copy
2. Initializes git with fixed author "E2E Test" and date "2025-01-01T00:00:00Z"
3. Symlinks `node_modules` from main repo for tool access
4. All tests reuse this isolated copy with normalized output
5. Cleanup runs after test suite completes

```
Main Repo (any git status)
  ├─ e2e-test-project/ (tracked in git)
  ├─ .e2e/ (isolated copies, gitignored)
  └─ test/e2e/*.test.ts → creates isolated copy
                              ↓
  .e2e/isolated-<random>/ (isolated git, deterministic)
    ├─ .git/ (fixed author: "E2E Test", date: 2025-01-01)
    ├─ node_modules/ → symlink to main repo
    └─ src/ (exact copy of files)
         ↓
  Linter (LANG=en_US.UTF-8, TZ=UTC) → git status (clean)
         ↓
  Output normalization (stripAnsi, normalize paths)
         ↓
  Deterministic output ✅
```

### Environment Variables

E2E tests set deterministic environment variables:

```bash
LANG=en_US.UTF-8          # Consistent locale
LC_ALL=en_US.UTF-8        # Override system locale
TZ=UTC                    # Fixed timezone
NO_COLOR=1                # Disable color output
FORCE_COLOR=0             # Ensure no ANSI codes
```

### Output Normalization

The `normalizeOutput()` function ensures deterministic test results:

1. **ANSI Stripping**: Removes color codes and cursor movement sequences
2. **Path Normalization**: `/tmp/path/src/file.ts` → `src/file.ts`
3. **Git Author**: Fixed to "E2E Test" instead of actual git user
4. **Timestamps**: Fixed to "2025-01-01" for consistent git diff output

### Mathematical Guarantees

```typescript
// INVARIANT: ∀ test_run ∈ E2E_Runs: git_status(isolated_copy) = CLEAN
// INVARIANT: ∀ t1, t2 ∈ TestRuns: normalize(linter_output(t1)) ≡ normalize(linter_output(t2))
// INVARIANT: ∀ commit ∈ MainRepo: ¬affects(commit, e2e_test_results)
// INVARIANT: ∀ env ∈ Environments: normalize(output(env)) = deterministic_output
```

### Benefits

- ✅ **Deterministic**: Tests always produce identical normalized output
- ✅ **Independent**: Main repo commits don't affect tests
- ✅ **Cross-platform**: Works on different OS/locale configurations
- ✅ **Realistic**: Tests validate actual git integration with fixed context
- ✅ **Simple**: No manual setup required
- ✅ **Versioned**: e2e-test-project changes tracked in main repo
- ✅ **Fast**: Isolated copy created once per test suite (~50-100ms)

### Implementation

- **Utility**: `test/utils/tempProject.ts::createIsolatedE2EProject()`
- **Integration**: `test/e2e/shared/test-utils.ts::createTestPaths()`
- **Normalization**: `test/e2e/shared/test-utils.ts::normalizeOutput()`
- **Lifecycle**: Created on first test, reused for all tests, cleaned after suite

### Directory Structure

```
.e2e/                           # Isolation directory (gitignored)
└── isolated-<random>/          # Unique per test run
    ├── .git/                   # Isolated git repo
    │   └── config              # Fixed author/email
    ├── node_modules/           # Symlink to main repo
    ├── src/                    # Test files
    ├── package.json            # Project config
    └── tsconfig.json           # TypeScript config
```

## Validation Strategy

1. **Exact matching**: Error messages must match 1-to-1 (except file paths)
2. **Cursor precision**: Column positioning validated to exact character
3. **Format consistency**: All errors follow identical structure
4. **Statistical accuracy**: Error counts mathematically verified
5. **Performance bounds**: Execution time constraints enforced

This ensures the linter output is reliable, consistent, and user-friendly across all scenarios.