import eslint from '@eslint/js'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  eslint.configs.recommended,

  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Math: 'readonly',
      },
    },

    rules: {
      'no-unused-vars': 'warn',
    },
  },
]
