# Contributing to vibecode-linter

Thank you for your interest in contributing! This document captures the architectural rules every PR **must** follow. These rules are derived from the project's `QUOTE(ТЗ)` (technical specification) and are enforced by code review.

## 🎯 Core Principles

### 1. F.C.I.S. — Functional Core, Imperative Shell

- **CORE** (`src/core/`): pure functions, no I/O, no `process`, no `console`, no exceptions
- **SHELL** (`src/shell/`): I/O, external tools, filesystem, network
- **APP** (`src/app/`): orchestrates CORE logic with SHELL integrations

**Rule**: `CORE → SHELL` is the only allowed dependency direction. CORE never imports from SHELL or APP.

### 2. Effect-TS for all effects

- All async/effectful code uses `Effect.gen`, `Effect.all`, `Effect.catchAll`
- **No** `async` / `await` / `Promise.all` in new code
- The only allowed `Promise` is the bridge in `bin/` (entry point → `Effect.runPromise`)

### 3. Type safety

- **No** `any`
- **No** `unknown` (unless an explicit type guard is provided within 1 statement)
- Use `as const` for literal types
- Use `readonly` modifiers for all data structures

### 4. Immutability

- **No** `let`
- All bindings are `const`
- All object/array types use `readonly` properties

### 5. File size

- **Maximum 300 lines per file** (including comments)
- If a file approaches the limit, split by responsibility (FCIS)

## 📝 Theorem Comments

Every exported function and significant internal function **must** include a theorem-style comment block with these sections:

```typescript
// CHANGE: What was changed
// WHY: The reasoning behind the change
// QUOTE(ТЗ): "Direct quote from the technical spec"  (when applicable)
// REF: Architecture plan reference
// PURITY: pure | impure (and why)
// EFFECT: Effect<A, E> | sync function signature
// INVARIANT: Properties that must always hold
// COMPLEXITY: Big-O notation
```

Plus a JSDoc block for the function itself with `@pure`, `@param`, `@returns`, `@complexity`, `@invariant` tags.

## ✅ PR Checklist

Before opening a PR, verify:

- [ ] No `any` / `unknown` introduced
- [ ] No `let`, only `const`
- [ ] All files under 300 lines
- [ ] Effect-TS used for all effects
- [ ] Theorem comments on every exported function
- [ ] Tests added for new logic (`vitest`)
- [ ] Tests use `vi.mock` for SHELL isolation
- [ ] `pnpm run lint` passes
- [ ] `pnpm run build` passes
- [ ] `pnpm run test` passes
- [ ] PR description explains **what** and **why**

## 🧪 Testing

- Framework: `vitest`
- Pure CORE helpers need no mocks
- SHELL-touching code uses `vi.mock("../../src/shell/...")`
- Effect-based code uses `Effect.runPromise` in tests

## 📦 Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new user-facing feature
- `fix:` — bug fix
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `test:` — add or modify tests
- `docs:` — documentation only
- `chore:` — build process, tooling, dependencies

One logical change per commit. Atomic.

## 🔄 Branching & PRs

- Branch from `main`
- Branch name format: `type/short-description` (e.g., `refactor/split-runLinter`)
- One PR = one logical change
- Open PR against upstream `ton-ai-core/vibecode-linter` (push to your fork first)
- Link related issues

## 🏗️ Project Structure

```
src/
├── app/           # Application layer (orchestration)
├── bin/           # Entry point (only place that may use runPromise)
├── core/          # Functional core (pure logic)
│   ├── decision.ts
│   ├── errors.ts
│   ├── models.ts
│   ├── types/     # Shared type definitions
│   └── utils/     # Pure helpers
└── shell/         # Imperative shell (I/O, external tools)
    ├── analysis/  # Pre-flight checks
    ├── config/    # CLI parsing, config loading
    ├── linters/   # ESLint, Biome, TypeScript integrations
    ├── output/    # SARIF, reporting
    ├── project-info/
    └── utils/     # SHELL-side utilities

test/              # Vitest tests (mirror src/ structure)
```

## 💡 Questions?

Open an issue with the `question` label.

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's existing license.
