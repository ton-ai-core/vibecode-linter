# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CONTRIBUTING.md` — Architectural rules, theorem comments spec, PR checklist
- `src/app/auto-fix.ts` — Parallel auto-fix orchestration module
- `src/app/collect-lint-messages.ts` — Parallel linter collection module
- `src/app/duplicates.ts` — SARIF parse + display + cleanup module
- `src/app/preflight.ts` — Preflight + dependency check module
- `src/core/utils/package-manager-params.ts` — Shared pure helper (DRY)
- 18 unit tests across 5 test files (vitest)

### Changed

- `src/app/runLinter.ts` split from **339 → 127 lines** to comply with the 300-lines-per-file rule
- `makeResolvePackageManagerParams` deduplicated into a single shared helper in `core/utils/`
- `process.cwd()` calls reduced from 4 to 1 in `runLinter.ts` (syscall optimization)
- `process.cwd()` cached in `preflight.ts`

### Fixed

- Test type signatures now correctly match implementation (e.g., `Dependency[]` vs `string[]`)

### Architecture

- **FCIS** (Functional Core, Imperative Shell) preserved
- **Effect-TS** for all effects (no `async`/`await` in new code)
- **Theorem comments** on every exported function
- **No** `any` / `unknown` / `let` in new code
- **All** files under 300 lines

## Previous Releases

See [GitHub Releases](https://github.com/ton-ai-core/vibecode-linter/releases) for older versions.

[Unreleased]: https://github.com/ton-ai-core/vibecode-linter/compare/main...HEAD
