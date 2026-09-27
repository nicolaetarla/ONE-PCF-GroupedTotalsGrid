module.exports = {
  testEnvironment: "<rootDir>/jest.environment.js",
  roots: ["<rootDir>/__tests__"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  moduleFileExtensions: ["ts", "tsx", "js"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false, tsconfig: "<rootDir>/tsconfig.test.json" }]
  },
  collectCoverageFrom: ["GroupedTotalsGrid/core/**/*.ts"],
  coverageThreshold: {
    "./GroupedTotalsGrid/core/": { statements: 85, branches: 75, functions: 85, lines: 85 }
  }
};
