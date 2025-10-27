# Project Structure

## Directory Organization

### Source Code (`src/`)

```
src/
├── index.ts                    # Public API exports
├── app/
│   └── runLinter.ts           # Main orchestration (APP layer)
├── bin/
│   └── vibecode-linter.ts     # CLI entry point
├── core/                      # Pure functions, no I/O
│   ├── decision.ts            # Exit code computation
│   ├── errors.ts              # Typed error classes
│   ├── models.ts              # Core domain models
│   ├── diff/                  # Git diff parsing
│   ├── format/                # Message formatting
│   ├── project/               # Project analysis
│   └── types/                 # Type definitions
└── shell/                     # I/O operations
    ├── analysis/              # Dependency analysis
    ├── config/                # Configuration loading
    ├── git/                   # Git operations
    ├── linters/               # External linter integrations
    ├── output/                # Result formatting and display
    ├── project-info/          # Project insights
    └── utils/                 # Shell utilities
```

### Tests (`test/`)

- **Mirror structure** of `src/` directory
- **Unit tests** for CORE layer (100% coverage required)
- **Integration tests** for SHELL layer
- **Fixtures** in `test/fixtures/`

### Configuration Files

- **tsconfig.json** - Solution-style with project references
- **tsconfig.base.json** - Shared compiler options
- **tsconfig.src.json** - Source compilation
- **tsconfig.test.json** - Test compilation
- **eslint.config.mts** - ESLint configuration
- **biome.json** - Biome formatter/linter config
- **jest.config.mjs** - Jest test configuration
- **linter.config.json** - Priority levels for error reporting

## Architecture Layers

### CORE Layer (`src/core/`)
- **Pure functions only** - no I/O, no side effects
- **100% test coverage required**
- **No dependencies on SHELL**
- **Mathematical operations** and data transformations
- **Type definitions** and domain models

### SHELL Layer (`src/shell/`)
- **I/O operations** - file system, external processes
- **External tool integrations** - ESLint, Biome, TypeScript
- **Git operations** - diff, blame, history
- **Configuration loading** and validation
- **Can depend on CORE** but not vice versa

### APP Layer (`src/app/`)
- **Orchestration** of CORE and SHELL components
- **Effect-based composition** for typed error handling
- **No process.exit()** - returns exit codes as values
- **Minimal console usage** (to be moved to services later)

## File Naming Conventions

- **kebab-case** for multi-word files (`change-tree.ts`)
- **camelCase** for single-word files (`decision.ts`)
- **index.ts** for barrel exports in each directory
- **Test files** mirror source structure with `.test.ts` suffix

## Import/Export Patterns

### Barrel Exports
- Each directory has `index.ts` for public API
- Re-export only what should be consumed externally
- Use explicit exports, avoid `export *`

### Import Rules
- **CORE cannot import from SHELL** (enforced by ESLint)
- **Use path aliases** `@/` for `src/` imports
- **Explicit file extensions** `.js` in imports (ESM requirement)
- **Type-only imports** use `import type` syntax

## Code Organization Principles

1. **Single Responsibility** - Each file has one clear purpose
2. **Dependency Direction** - SHELL → APP → CORE (never reversed)
3. **Pure vs Impure** - Clear separation between pure and effectful code
4. **Testability** - CORE functions are easily testable in isolation
5. **Modularity** - Each module can be understood independently