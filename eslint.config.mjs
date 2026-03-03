import tseslint from 'typescript-eslint'
import vitestPlugin from '@vitest/eslint-plugin'
import noGenericNames from './lint/no-generic-names.js'

export default tseslint.config(
  {
    plugins: {
      custom: {
        rules: {
          'no-generic-names': noGenericNames,
        },
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'custom/no-generic-names': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'VariableDeclaration[kind="let"]',
          message: 'Use const. Avoid mutation.',
        },
        {
          selector: 'NewExpression[callee.name="Error"]',
          message: 'Use custom precise error classes instead of generic Error.',
        },
      ],
      'prefer-const': 'error',
      'max-lines': ['error', 400],
      'max-depth': ['error', 3],
      complexity: ['error', 12],
      'no-inline-comments': 'error',
      'no-negated-condition': 'error',
    },
  },
  {
    files: ['src/**/*.spec.ts'],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/prefer-strict-equal': 'error',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/max-expects': ['error', { max: 4 }],
      'vitest/require-to-throw-message': 'error',
    },
  },
)
