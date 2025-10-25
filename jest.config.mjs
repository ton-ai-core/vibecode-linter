// CHANGE: Move Jest configuration out of package.json into a dedicated file
// WHY: Keep package.json lean and have a single source of truth for test config
// PURITY: SHELL (configuration only, no runtime logic)

export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          strict: true,
          noImplicitAny: true,
          strictNullChecks: true,
          strictFunctionTypes: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          baseUrl: "<rootDir>",
          paths: {
            "@/*": ["src/*"]
          }
        }
      }
    ]
  },
  coverageProvider: "babel",
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/**/__tests__/**"
  ],
  forceCoverageMatch: ["<rootDir>/src/core/**/*.ts"],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10
    },
    "src/core/**/*.ts": {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
