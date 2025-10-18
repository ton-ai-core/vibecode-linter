# vibecode-linter

Advanced TypeScript linter with Git integration, dependency analysis, and comprehensive error reporting.

## 🚀 Installation

### Quick Start (Recommended)

```bash
npx @ton-ai-core/vibecode-linter@latest src/
```

### Global Installation

```bash
npm install -g @ton-ai-core/vibecode-linter
vibecode-linter src/
```

## 📖 Usage

```bash
# Lint a directory
npx @ton-ai-core/vibecode-linter src/

# Lint a specific file
npx @ton-ai-core/vibecode-linter src/main.ts

# Skip auto-fix (only report errors)
npx @ton-ai-core/vibecode-linter src/ --no-fix

# Set maximum duplicate code blocks to show
npx @ton-ai-core/vibecode-linter src/ --max-clones 10

# Set terminal width for output
npx @ton-ai-core/vibecode-linter src/ --width 120
```

## 📊 Example Output

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

    --- git diff b001809..b1662a1 -- src/telegram/bot.ts | cat
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

## 🔧 Development Setup

### Prerequisites

- Node.js >= 18.0.0
- Git repository

### Installation

1. **Clone and install dependencies:**

```bash
git clone https://github.com/ton-ai-core/vibecode-linter.git
cd vibecode-linter
npm install
```

2. **Install linter dependencies (from devDependencies):**

```bash
# Install all linters used by vibecode-linter
npm install -D \
  @biomejs/biome@2.2.4 \
  @eslint-community/eslint-plugin-eslint-comments@^4.5.0 \
  @eslint/js@^9.35.0 \
  @typescript-eslint/eslint-plugin@^8.44.1 \
  @typescript-eslint/parser@^8.44.1 \
  eslint@^9.36.0 \
  typescript@^5.9.2
```

3. **Build and test:**

```bash
npm run build
npm run lint
```

## ⚙️ Configuration Files

Copy these configuration files to your project root:

- **ESLint:** [eslint.config.mts](https://github.com/ton-ai-core/vibecode-linter/blob/main/eslint.config.mts)
- **Linter Priority:** [linter.config.json](https://github.com/ton-ai-core/vibecode-linter/blob/main/linter.config.json)
- **Biome:** [biome.json](https://github.com/ton-ai-core/vibecode-linter/blob/main/biome.json)
- **Duplicate Detection:** [.jscpd.json](https://github.com/ton-ai-core/vibecode-linter/blob/main/.jscpd.json)

## ✨ Features

- **Git-aware error reporting** - Shows git diff context for every error
- **Commit history analysis** - Displays changes that led to the error  
- **Dependency-based ordering** - Sorts errors by definition→usage relationships
- **Priority-based filtering** - Configurable error severity levels
- **Code duplication detection** - Finds duplicate code across your project
- **Auto-fix support** - Automatically fixes lint errors where possible

## 🐛 Troubleshooting

### "Missing required dependencies"

Install the required linters:

```bash
npm install -D eslint @biomejs/biome typescript
```

### "No git repository found"

Make sure you're running inside a git repository:

```bash
git init
git add .
git commit -m "Initial commit"
```

### "ESLint couldn't find config file"

Create an `eslint.config.js` file in your project root (see configuration examples above).

## 📄 License

MIT