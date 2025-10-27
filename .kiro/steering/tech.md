# Technology Stack

## Core Technologies

- **TypeScript 5.9+** - Primary language with strict type checking
- **Node.js 18+** - Runtime environment
- **ESM Modules** - Modern module system (type: "module")

## Key Dependencies

### Runtime Dependencies
- **Effect** - Functional programming library for typed effects
- **ts-pattern** - Pattern matching for TypeScript
- **loop-controls** - Functional iteration utilities
- **jscpd** - Code duplication detection
- **ajv** - JSON schema validation

### Linting Tools
- **ESLint 9+** - JavaScript/TypeScript linting
- **Biome** - Fast formatter and linter
- **TypeScript Compiler** - Type checking and diagnostics

### Development Tools
- **Jest** - Testing framework with ESM support
- **Stryker** - Mutation testing
- **tsx** - TypeScript execution for development

## Build System

### Common Commands

```bash
# Development
npm run build          # Compile TypeScript to dist/
npm run lint           # Run vibecode-linter on src/
npm run test           # Run full test suite (lint + build + jest)

# Publishing
npm run release        # Build + lint + version + publish

# Testing
npm run mutation       # Run mutation testing with Stryker
```

### TypeScript Configuration

- **Solution-style setup** with project references
- **Strict mode enabled** with additional strict checks
- **ESM target** (ES2022, NodeNext module resolution)
- **Path mapping** with `@/*` aliases for `src/*`

### Build Output

- **dist/** - Compiled JavaScript with type declarations
- **Dual exports** - Both CommonJS and ESM compatibility
- **CLI binary** - `vibecode-linter` command available globally

## Architecture Patterns

### Functional Core, Imperative Shell (FCIS)
- **CORE** (`src/core/`) - Pure functions, no I/O, 100% test coverage required
- **SHELL** (`src/shell/`) - I/O operations, external tool integrations
- **APP** (`src/app/`) - Orchestration layer using Effect for composition

### Effect-TS Integration
- All async operations use Effect for typed error handling
- Parallel execution with `Effect.all`
- Error recovery with `Effect.catchAll`

### Code Quality Standards
- **Max 300 lines per file**
- **Max 50 lines per function**
- **Complexity limit: 8**
- **100% test coverage for CORE layer**