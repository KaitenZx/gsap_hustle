import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin';
import love from 'eslint-config-love'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-node';
import vitestPlugin from 'eslint-plugin-vitest';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';



export default [
  {
    ignores: ['node_modules', 'dist', '*.config.js', '**/*.tsbuildinfo'],
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.ts', '.tsx'],
        },
      },
      react: {
        version: 'detect', // Автоматически определять версию React
      },
    },

  },

  {
    ...love,
    // Файлы, к которым применяются эти настройки
    files: ['backend/**/*.ts', 'backend/**/*.tsx'],
    languageOptions: {
      // Ставим сам парсер
      parser: tsParser,
      // Сливаем parserOptions, если их задаёт love,
      // + указываем нужный tsconfig
      parserOptions: {
        ...love.languageOptions?.parserOptions,
        // Можно передать массив, если у вас несколько tsconfig
        project: ['./backend/tsconfig.json'],
        // Часто нужно указать корень репо для правильных путей:
        // tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "no-console": "error",
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'parent', 'sibling', 'index'],
          pathGroups: [
            {
              pattern: '{.,..}/**/env',
              group: 'builtin',
              position: 'before',
            },
            {
              pattern: '{.,..}/**/test/integration',
              group: 'builtin',
              position: 'before',
            },
          ],
          alphabetize: {
            order: 'asc',
            caseInsensitive: false,
            orderImportKind: 'asc',
          },
        },
      ],
    }
  },

  {
    // Применяем к файлам webapp
    files: ['webapp/**/*.ts', 'webapp/**/*.tsx'],
    // Начинаем с конфигурации love
    ...love,
    // Добавляем настройки парсера для TS
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ...love.languageOptions?.parserOptions,
        project: ['./webapp/tsconfig.json'],
        // Добавляем опции для JSX, если love их не добавляет
        ecmaFeatures: { jsx: true },
      },
      // Указываем глобальные переменные для браузера, если нужно
      globals: {
        // Например:
        window: 'readonly',
        document: 'readonly',
        // ...другие браузерные API
      }
    },
    // Регистрируем плагины
    plugins: {
      react: reactPlugin,
      'react-hooks': hooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      // Наследуем рекомендуемые правила React Hooks
      ...hooksPlugin.configs.recommended.rules,
      // Наследуем рекомендуемые правила JSX A11y
      ...jsxA11yPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'no-console': [
        'error',
        {
          allow: ['info', 'error', 'warn'],
        },
      ],
      'import/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
            caseInsensitive: false,
            orderImportKind: 'asc',
          },
        },
      ],
    }
  },

  {
    ...love,
    files: ['shared/**/*.ts', 'shared/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ...love.languageOptions?.parserOptions,
        project: ['./shared/tsconfig.json'],
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
            caseInsensitive: false,
            orderImportKind: 'asc',
          },
        },
      ],
    }
  },



  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { // Явно укажем парсер для этих файлов
      parser: tsParser,
    },
    plugins: {
      node: nodePlugin, // Убедись, что плагин зарегистрирован, если используешь его правила (node/no-process-env)
      import: importPlugin,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/ban-types': 'off',
      'arrow-body-style': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      'eslint-comments/require-description': 'off',
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@brightideas/backend/**",
                "!@brightideas/backend/**/",
                "!@brightideas/backend/**/input",
                "!@brightideas/backend/src/utils/can",
              ],
              allowTypeImports: true,
              message:
                "Only types and input schemas are allowed to be imported from backend workspace",
            },
          ],
        },
      ],
      "@typescript-eslint/prefer-destructuring": "off",
      curly: ['error', 'all'],
      'no-irregular-whitespace': [
        'error',
        {
          skipTemplates: true,
          skipStrings: true,
        },
      ],

      'node/no-process-env': "error",
      'no-restricted-syntax': [
        'error',
        {
          selector: '[object.type=MetaProperty][property.name=env]',
          message: 'Use instead import { env } from "lib/env"',
        },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/**/!(*.integration.test.ts)',
              from: './src/test',
              message: 'Import something from test dir only inside integration tests',
            },
          ],
        },
      ],

    },
  },


  {
    ...prettier,
    files: ['**/*.ts', '**/*.tsx'],
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    // Используем рекомендуемые правила для Vitest
    ...vitestPlugin.configs.recommended,
    plugins: {
      // Регистрируем плагин под именем 'vitest' (или как тебе удобнее)
      vitest: vitestPlugin,
    },
  }


]