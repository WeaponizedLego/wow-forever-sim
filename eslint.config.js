import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '.claude/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      'apps/web/**',
      'packages/proto/src/generated/**',
    ],
  },
  ...tseslint.configs.recommended,
  prettier,
);
