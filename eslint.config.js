const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      semi: 'error',
      'no-console': 'off',
    },
  },
  {
    files: [
      'src/core/automation/**/*.js',
      'src/core/ai-pipeline.js',
      'src/core/douyin-scraper.js',
      'src/core/facebook-toolkit.js',
      'src/core/channel-manager.js',
      'src/core/platforms/facebook-poster.js',
    ],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly', location: 'readonly', token: 'readonly' },
    },
  },
  {
    files: ['renderer/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        api: 'readonly',
        EB: 'readonly',
        KZSecure: 'readonly',
        KZ: 'writable',
        escHtml: 'readonly',
        kzSecureStore: 'writable',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      semi: 'error',
      'no-console': 'off',
    },
  },
  prettier,
];
