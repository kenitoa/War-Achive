import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'], languageOptions: { globals: { fetch: 'readonly', window: 'readonly', document: 'readonly', URL: 'readonly', Blob: 'readonly', FileReader: 'readonly', RequestInit: 'readonly', Response: 'readonly', AbortSignal: 'readonly', setTimeout: 'readonly' } } },
);
