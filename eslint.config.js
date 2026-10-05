import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default [
  {
    // `dist` is the build output. `design-system` is an independent
    // sub-package (its own package.json, tsconfig, jest config and
    // .eslintrc.json) with its own `lint`/`test` scripts, so it is not
    // meant to be linted by the root app's ESLint config. `coverage`
    // directories are generated test-coverage reports (git-ignored at the
    // repo root; excluded here defensively for any nested copies too).
    ignores: ['dist', 'design-system/**', '**/coverage/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        eccmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },
  ...tseslint.configs.recommended,
  {
    // Allow the conventional `_foo` prefix to mark a parameter or binding as
    // intentionally unused (e.g. stub handlers awaiting a real backend).
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Test files commonly need `any` to type mocks, spies, and fixture
    // payloads without fighting the type system. Keep the stricter rule for
    // application source code.
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
