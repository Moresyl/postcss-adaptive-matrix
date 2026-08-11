// @ts-check
/**
 * What the compiler cannot say.
 *
 * `tsc --noEmit` already runs under `strict` and `noUncheckedIndexedAccess`, so
 * the rules worth turning on here are the ones type-checking has no opinion
 * about: a promise nobody awaited, a condition that can only ever be true, a
 * `catch` that widens an error into `any`. Everything stylistic is off — that is
 * Prettier's job, and `eslint-config-prettier` removes the overlap rather than
 * letting the two argue about it in CI.
 *
 * Type-aware linting needs the same program the compiler builds, so the config
 * points at the repository's real `tsconfig.json` rather than a lint-only copy
 * that could drift from it.
 */
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'docs/.vitepress/cache',
      'docs/.vitepress/dist',
      '.firecrawl',
      '.libcheck',
      'examples/*/dist',
      'examples/*/*.config.js',
      '.probe-*.mts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An unhandled rejection in a CLI is an exit code nobody sees.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // A leading underscore is the established way to say "declared, unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `catch (e)` types `e` as `any` under older configs; keep it `unknown`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // Template literals are how every diagnostic in this codebase is built.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  {
    // Tests reach into internals and deliberately pass wrong shapes to prove the
    // validation rejects them; that is the point of the file, not a defect.
    files: ['test/**/*.ts', 'bench/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    rules: {
      // A test that stands a fake `window.visualViewport` up out of object
      // literals is not separating a method from its receiver by accident.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Plain JavaScript with no program behind it: lint it, but not with rules
    // that need types.
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
