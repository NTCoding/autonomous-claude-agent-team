import tseslint from 'typescript-eslint'
import noGenericNames from './no-generic-names.js'

const customRules = {
  plugins: {
    custom: {
      rules: {
        'no-generic-names': noGenericNames,
      },
    },
  },
}

const baseConfig = tseslint.config(
  customRules,
  {
    files: ['**/*.ts', '**/*.tsx'],
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
          message: 'Use custom precise error classes instead of generic Error or fail assertions in tests.',
        },
      ],
      'prefer-const': 'error',

      'max-depth': ['error', 3],
      complexity: ['error', 12],

      'no-inline-comments': 'error',
      'no-negated-condition': 'error',
    },
  },
)

try {
  const vitest = await import('@vitest/eslint-plugin')
  baseConfig.push({
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest: vitest.default },
    rules: {
      'vitest/prefer-strict-equal': 'error',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/max-expects': ['error', { max: 4 }],
      'vitest/require-to-throw-message': 'error',
    },
  })
} catch {
  // @vitest/eslint-plugin not available in target repo — skip vitest rules
}

export default baseConfig
