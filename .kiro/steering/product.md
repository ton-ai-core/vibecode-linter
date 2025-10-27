# Product Overview

**vibecode-linter** is an advanced TypeScript linter with Git integration, dependency analysis, and comprehensive error reporting.

## Core Features

- **Git-aware error reporting** - Shows git diff context for every error
- **Commit history analysis** - Displays changes that led to the error  
- **Dependency-based ordering** - Sorts errors by definition→usage relationships
- **Priority-based filtering** - Configurable error severity levels
- **Code duplication detection** - Finds duplicate code across your project
- **Auto-fix support** - Automatically fixes lint errors where possible

## Target Users

- TypeScript developers seeking comprehensive code quality analysis
- Teams requiring Git-integrated linting workflows
- Projects needing dependency-aware error reporting

## Key Value Propositions

1. **Context-Rich Errors**: Every lint error includes git diff context and commit history
2. **Smart Ordering**: Errors are sorted by dependency relationships (definitions before usages)
3. **Comprehensive Analysis**: Combines ESLint, Biome, TypeScript compiler, and duplicate detection
4. **Developer Experience**: Rich terminal output with syntax highlighting and actionable suggestions

## Usage Modes

- **CLI Tool**: `npx @ton-ai-core/vibecode-linter src/`
- **Library**: Programmatic API for integration into build systems
- **CI/CD**: Returns proper exit codes for automated workflows