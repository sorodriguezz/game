import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/db/drizzle/**',
      'apps/web/public/**',
      'Reinos_de_la_Frontera_MVP2/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Usa el PRNG sembrado de @reinos/game-rules (ADR-0005).',
        },
      ],
    },
  },
  {
    files: ['apps/web/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/web/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
      },
    },
  },
);
