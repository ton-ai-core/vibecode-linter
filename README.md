# vibecode-linter

Advanced TypeScript linter with Git integration, dependency analysis, and comprehensive error reporting.

## 🎯 What is vibecode-linter?

`vibecode-linter` is an intelligent linting tool that combines ESLint, TypeScript, and Biome to provide:

- **Git-aware error reporting** - Shows git diff context for every error
- **Commit history analysis** - Displays changes that led to the error
- **Dependency-based ordering** - Sorts errors by definition→usage relationships
- **Priority-based filtering** - Configurable error severity levels
- **Code duplication detection** - Finds duplicate code across your project
- **Auto-fix support** - Automatically fixes lint errors where possible

## 🚀 Installation

```bash
npm install -g vibecode-linter
```

Or use directly with `npx`:

```bash
npx vibecode-linter src/
```

## 📖 Usage

### Basic Usage

```bash
# Lint a directory
vibecode-linter src/

# Lint a specific file
vibecode-linter src/telegram/bot.ts

# Skip auto-fix (only report errors)
vibecode-linter src/ --no-fix

# Set maximum duplicate code blocks to show
vibecode-linter src/ --max-clones 10

# Set terminal width for output
vibecode-linter src/ --width 120
```

### With npm scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "lint": "vibecode-linter src/",
    "lint:file": "vibecode-linter",
    "lint:no-fix": "vibecode-linter src/ --no-fix"
  }
}
```

## ✨ Features

### 1. Git-Aware Error Reporting

Every error shows:
- **Workspace diff** - Current uncommitted changes
- **Commit history** - Last 3 commits that touched the error line
- **Diff context** - Shows what was removed (-) and added (+)

### 2. Intelligent Error Sorting

Errors are sorted by:
1. **Definition→Usage order** - Definition errors shown before usage errors
2. **Severity** - Errors before warnings
3. **File path** - Alphabetically
4. **Line number** - Top to bottom

### 3. Priority Levels

Configure error priorities in `linter.config.json`:

```json
{
  "priorityLevels": [
    {
      "level": 1,
      "name": "Critical Type Errors",
      "rules": ["@typescript-eslint/no-explicit-any", "ts2322", "ts2304"]
    },
    {
      "level": 2,
      "name": "Security Issues",
      "rules": ["@eslint-community/no-secrets/no-secrets"]
    }
  ]
}
```

### 4. Code Duplication Detection

Uses `jscpd` to find duplicate code blocks:
- Minimum 30 tokens
- SARIF report generation
- Side-by-side diff display

## 📊 Output Example

```bash
[ERROR] /home/user/TradingBot/src/telegram/bot.ts:78:30 @ton-ai-core/suggest-members/suggest-imports (ESLint) — Variable "Comman1dHandlers" is not defined. Did you mean:
  - CommandHandlers
  - console
  - Console

--- git diff (workspace, U=3) -------------------------
@@ -75,7 +75,7 @@ export class TelegramNotificationBot implements TelegramBot {
    75 |                         logger: options.logger,
    76 |                 });
    77 | 
-      |                 this.commandHandlers = new CommandHandlers({
+   78 |                 this.commandHandlers = new Comman1dHandlers({
                                                    ^^^^^^^^^^^^^^^^  
    79 |                         gateway: this.gateway,
    80 |                         dbManager: options.dbManager,
    81 |                         appConfig: options.config,
---------------------------------------------------------------

    --- git diff b001809..b1662a1 -- src/telegram/bot.ts | cat ---
    b1662a1 (2025-09-30) by skulidropek: устранение дубликатов
    b001809 (2025-09-28) by skulidropek: implement code review
    @@ -75,7 +75,7 @@
        73 | logger: options.logger,
        74 | });
        75 | 
    -   76 | this.handlers = new BaseHandlers({
    +   78 | this.commandHandlers = new CommandHandlers({
        79 | gateway: this.gateway,
    ---------------------------------------------------------------
    
    Full list: git log --follow -- src/telegram/bot.ts | cat

📊 Total: 16 errors (3 TypeScript, 5 ESLint, 8 Biome), 11 warnings.
```

## 🔧 Configuration

### linter.config.json

Create `linter.config.json` in your project root:

```json
{
  "priorityLevels": [
    {
      "level": 1,
      "name": "Critical Compiler Errors",
      "rules": [
        "@typescript-eslint/no-explicit-any",
        "@typescript-eslint/no-unsafe-assignment",
        "ts2322",
        "ts2304",
        "ts2345"
      ]
    },
    {
      "level": 2,
      "name": "Code Quality Issues",
      "rules": [
        "functional/immutable-data",
        "functional/no-let",
        "functional/prefer-readonly-type"
      ]
    },
    {
      "level": 3,
      "name": "Style and Formatting",
      "rules": [
        "biome/style/*",
        "@stylistic/*"
      ]
    }
  ]
}
```

### Rule Matching

Rules are matched case-insensitively and support:
- Exact match: `"ts2322"`
- Prefix match: `"@typescript-eslint/*"`
- Category match: `"biome/style/*"`

## 🏗️ Architecture

```
vibecode-linter/
├── src/
│   ├── main.ts              # Entry point
│   ├── analysis/            # Dependency analysis
│   │   ├── dependencies.ts  # TypeScript AST analysis
│   │   └── index.ts
│   ├── config/              # Configuration
│   │   ├── cli.ts           # CLI argument parsing
│   │   ├── loader.ts        # Config file loading
│   │   └── index.ts
│   ├── diff/                # Git diff parsing
│   │   ├── column.ts        # Column calculations
│   │   ├── parser.ts        # Unified diff parser
│   │   └── index.ts
│   ├── git/                 # Git operations
│   │   ├── blame.ts         # Git blame
│   │   ├── diff.ts          # Git diff
│   │   ├── history.ts       # Commit history
│   │   ├── utils.ts         # Git helpers
│   │   └── index.ts
│   ├── linters/             # Linter integrations
│   │   ├── biome.ts         # Biome integration
│   │   ├── eslint.ts        # ESLint integration
│   │   ├── typescript.ts    # TypeScript compiler
│   │   └── index.ts
│   ├── output/              # Output formatting
│   │   ├── duplicates.ts    # Duplicate code display
│   │   ├── printer.ts       # Error printing
│   │   └── index.ts
│   └── types/               # Type definitions
│       ├── config.ts
│       ├── diff.ts
│       ├── git.ts
│       ├── messages.ts
│       └── index.ts
└── ...
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design documentation.

## 🎓 How It Works

### 1. Auto-Fix Phase

First, vibecode-linter runs auto-fix for ESLint and Biome:

```bash
npx eslint --fix
npx biome check --write
```

### 2. Error Collection

Runs linters in parallel:
- **TypeScript** - Full project type checking (`tsc --noEmit`)
- **ESLint** - JavaScript/TypeScript linting
- **Biome** - Fast linting and formatting checks

### 3. Dependency Analysis

Builds TypeScript AST to:
- Find symbol definitions
- Trace import relationships
- Build dependency graph
- Topologically sort errors (definition → usage)

### 4. Git Context Enrichment

For each error:
1. Gets `git diff` for workspace changes
2. Extracts commit history for the line
3. Shows diffs between consecutive commits
4. Displays only commits where the line changed

### 5. Priority Filtering

- Groups errors by priority level from `linter.config.json`
- Shows highest priority level first
- Limits output to 15 errors per level

### 6. Duplicate Detection

Runs `jscpd` to find code duplicates:
- Generates SARIF report
- Shows side-by-side comparison
- Only shown when no lint errors exist

## 🔬 Git Integration Details

### Workspace Diff

Shows current uncommitted changes with:
- Line numbers from HEAD
- Visual column-based cursor positioning
- Tab expansion (8 spaces)
- Caret (^) pointing to exact error position

### Commit Diff Blocks

For each error, shows up to 3 commit blocks:

```
--- git diff <older>..<newer> -- file.ts | cat ---
<newer-hash> (<date>) by <author>: <summary>
<older-hash> (<date>) by <author>: <summary>
@@ -75,7 +75,7 @@
    73 | contextBefore1
    74 | contextBefore2
    75 | contextBefore3
-      | removedLine1
-      | removedLine2
+   78 | addedLine1
+   79 | addedLine2
    80 | contextAfter1
    81 | contextAfter2
---------------------------------------------------------------
```

**Important:** Only commits where the error line was actually modified are shown. If a commit didn't touch the error line, it's skipped with "(no changes in this commit)".

### Context Lines

- **Before changes:** 2-3 context lines
- **Removed lines (-):** Up to 5 lines
- **Added lines (+):** Up to 5 lines
- **After changes:** 2-3 context lines
- Total: ~10-16 lines per diff block

## 🧪 Development

### Prerequisites

- Node.js >= 18.0.0
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run with watch mode
npm run dev -- src/
```

### Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Code Quality

```bash
# Lint the linter itself
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## 📝 Requirements Traceability Matrix

All features are tracked in [RTM.md](./RTM.md) with:
- REQ-IDs for every requirement
- Implementation status
- Test coverage
- Related commits

## 🐛 Troubleshooting

### "No git repository found"

Make sure you're running the linter inside a git repository:

```bash
git init  # If needed
git add .
git commit -m "Initial commit"
```

### "Failed to parse ESLint output"

Large projects may exceed the default buffer size. The linter automatically uses 10MB buffer, but you can increase it in the code if needed.

### "TypeScript errors not showing"

The linter runs `tsc` on the entire project. Make sure your `tsconfig.json` includes all source files:

```json
{
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### "Biome diagnostics failed"

If Biome fails on the directory, the linter falls back to checking individual files. This is expected for large projects.

## 🤝 Contributing

Contributions are welcome! Please:

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Use conventional commits
5. Keep functions pure and immutable

## 📄 License

MIT

## 👥 Authors

vibecode-linter team

---

**Made with ❤️ for better code quality**
