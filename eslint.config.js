import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'dev-dist/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      // Build-time constants from scripts/vite-shared.js.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __BUILD_DATE__: 'readonly', __EDITION__: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'smart'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['src/workers/**/*.worker.js'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['*.config.js', 'scripts/**', 'tests/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // App boundary (NEXUS_BRIEF.md §5.3): apps and games talk to the OS only through `ctx`.
  // They may import their own files, shared UI and styles, and (games) the game engine.
  {
    files: ['src/apps/*/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: String.raw`^\.\./(?!\.\./(ui|styles)/)`, message: 'Apps use ctx, ui/ and styles/ only.' },
          ],
        },
      ],
    },
  },
  // Same boundary one folder deeper (e.g. src/apps/terminal/shell/*.js): "../" stays in the app.
  // Apps keep at most one level of subfolders, so these two blocks cover every app file.
  {
    files: ['src/apps/*/*/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: String.raw`^(\.\./){2}(?!\.\./(ui|styles)/)`, message: 'Apps use ctx, ui/ and styles/ only.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/games/*/**/*.js'],
    ignores: ['src/games/engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^\.\./(?!engine(/|$)|\.\./(ui|styles)/)`,
              message: 'Games use ctx, the game engine, ui/ and styles/ only.',
            },
          ],
        },
      ],
    },
  },
];
