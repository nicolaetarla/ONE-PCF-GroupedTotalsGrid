// @ts-check
/**
 * Minimal ESLint flat config.
 *
 * This exists because `pcf-scripts` runs ESLint itself as a pipeline step - in
 * the `build`, `rebuild`, `start` and `lint` task groups - and fails with
 * "Could not find config file." when none is present. ESLint cannot simply be
 * removed from a PCF project; it can only be configured or neutered.
 *
 * ESLint 9 requires flat config, so this must stay as eslint.config.mjs.
 * A legacy .eslintrc.json will NOT be picked up.
 *
 * Scope is deliberately small. TypeScript's own `strict`, `noUnusedLocals` and
 * `noUnusedParameters` already cover most of what a big rule set would catch,
 * so this only adds the things the compiler cannot see, and turns off rules
 * that fight patterns this codebase uses on purpose.
 *
 * To skip linting during builds without deleting this file, add a pcfconfig.json
 * at the project root containing { "skipBuildLinting": true }. Note that this
 * only affects `build` and `rebuild` - `pcf-scripts start` lints regardless.
 */

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/generated/**", // ManifestTypes.d.ts is emitted by pcf-scripts
      "**/out/**",
      "**/dist/**",
      "**/*.js", // guard scripts and jest config are plain CommonJS
      "**/*.mjs"
    ]
  },

  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true }
        // No `project` setting on purpose: type-aware linting roughly triples
        // build time and duplicates what tsc already enforces.
      }
    },
    rules: {
      // tsc's noUnusedLocals/noUnusedParameters already reports these, and the
      // two disagree about leading-underscore parameters.
      "@typescript-eslint/no-unused-vars": "off",

      // Real signal, kept on. The codebase should have no bare `any` outside
      // platform boundaries, and each of those is cast explicitly.
      "@typescript-eslint/no-explicit-any": "error",

      // Empty catch blocks are used deliberately throughout the aggregate path:
      // metadata and paging failures degrade to a fallback rather than throwing.
      // Each one carries a comment explaining the degradation.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Debug logging is gated behind the enableDebugLogging property.
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  },

  {
    // Tests assert on deliberately malformed input, so a few strictures relax.
    files: ["__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
