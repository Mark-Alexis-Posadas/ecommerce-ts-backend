import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', 'node_modules/**']),
  {
    files: ['**/*.{ts,js,cjs,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  eslintConfigPrettier,
]);
