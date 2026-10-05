import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Workstreams must go through src/core's public API rather than reaching into internals.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/core/*', '!**/core/index'], message: 'Import from src/core (index) instead.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  prettier,
);
