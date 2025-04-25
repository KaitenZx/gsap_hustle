// eslint.config.mjs
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import love from 'eslint-config-love'; // Ваша база правил от 'love'
import prettierConfig from 'eslint-config-prettier'; // Отключает конфликты с Prettier
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import refreshPlugin from 'eslint-plugin-react-refresh'; // Для Vite/React HMR
import vitestPlugin from 'eslint-plugin-vitest';
import globals from 'globals'; // Для удобного определения глобальных переменных

// Получаем абсолютный путь к директории проекта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  // 1. Глобальные игноры и настройки
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vite/**', // Игнор кэша Vite
      '.vite-temp/**', // Игнор временных файлов Vite
      '**/*.tsbuildinfo', // Игнор информации сборки TS
      'coverage/**', // Игнор отчетов о покрытии тестами
      'public/**', // Обычно не линтим public
    ],
    linterOptions: {
      // Сообщаем ESLint, что отчеты об неиспользуемых директивах не нужны
      reportUnusedDisableDirectives: 'warn', // или 'off'/'error'
    },
    languageOptions: {
      // Глобальные переменные для всего проекта
      globals: {
        ...globals.browser, // Переменные браузера (window, document, etc.)
        ...globals.es2021, // Переменные ES2021
        NodeJS: 'readonly', // Добавляем NodeJS для типов вроде NodeJS.Timeout
      },
    },
    settings: {
      // Настройки для плагина eslint-plugin-import
      'import/resolver': {
        typescript: { // Используем резолвер для TypeScript
          project: [`${__dirname}/tsconfig.app.json`, `${__dirname}/tsconfig.node.json`],
        },
        node: true // Также используем стандартный резолвер Node
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      // Настройки для плагина eslint-plugin-react
      react: {
        version: 'detect', // Автоматически определять версию React
      },
    },
  },

  // 2. Базовая конфигурация для JS/TS файлов (на основе 'love')
  {
    // Применяем ко всем JS/TS файлам, кроме конфигурационных (их настроим отдельно)
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    // Наследуем правила из eslint-config-love
    ...love,
    languageOptions: {
      // Переопределяем парсер и его опции из 'love' для TS
      parser: tsParser,
      parserOptions: {
        ...love.languageOptions?.parserOptions, // Сохраняем опции из 'love', если они есть
        project: [`${__dirname}/tsconfig.app.json`], // Указываем TSConfig для src
        tsconfigRootDir: __dirname, // Явно указываем корень для tsconfig
        ecmaVersion: 2021, // Используем современный JS
        sourceType: 'module', // Используем ES модули
        ecmaFeatures: {
          jsx: true, // Включаем поддержку JSX
        },
      },
    },
    // Подключаем плагины
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      'react-refresh': refreshPlugin,
    },
    // Правила
    rules: {
      // Наследуем рекомендуемые правила плагинов
      ...tsPlugin.configs['recommended-type-checked'].rules, // Используем правила с проверкой типов
      ...tsPlugin.configs['stylistic-type-checked'].rules,
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules, // Правила импорта для TS

      // --- Правила из 'love' уже применены через ...love ---
      // --- Кастомные правила и переопределения ---

      // TypeScript правила
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'], // Предпочитать 'type' вместо 'interface'
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Предупреждать о неиспользуемых переменных
      '@typescript-eslint/explicit-function-return-type': 'off', // Не требовать явного указания типа возвращаемого значения функции
      '@typescript-eslint/no-explicit-any': 'warn', // Предупреждать об использовании any
      '@typescript-eslint/no-floating-promises': 'warn', // Предупреждать о "висящих" промисах
      '@typescript-eslint/no-misused-promises': 'warn', // Предупреждать о неправильном использовании промисов (например, в условиях)
      // Отключим некоторые строгие или спорные правила (можно включить при необходимости)
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Часто мешает, ставим warn
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-magic-numbers': 'off', // Числа часто нужны в UI/анимациях

      // React правила
      'react/react-in-jsx-scope': 'off', // Не нужно с новым JSX transform
      'react/prop-types': 'off', // Используем TypeScript для типов пропсов
      'react/jsx-filename-extension': ['warn', { extensions: ['.tsx', '.jsx'] }], // Предпочитать .tsx/.jsx для файлов с JSX
      'react/jsx-key': 'error', // Обязательно указывать key в списках

      // React Refresh (Vite HMR)
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true }, // Разрешить экспорт констант из компонентов
      ],

      // JSX A11y - можно настроить строже/мягче по необходимости
      'jsx-a11y/anchor-is-valid': 'warn', // Часто нужно для <Link> или кнопок-ссылок

      // Import правила
      'import/order': [ // Сортировка импортов
        'warn',
        {
          groups: [
            'builtin', // Встроенные модули Node.js (хотя в фронте их мало)
            'external', // Внешние пакеты
            'internal', // Абсолютные импорты из проекта (если настроен alias)
            'parent', // Импорты из родительских директорий
            'sibling', // Импорты из соседних директорий
            'index', // Импорты index файлов (./ или ../)
            'object', // Импорты типов (`import type {}`)
            'type', // Отдельно не используется, но входит в 'object'
          ],
          pathGroups: [ // Можно добавить кастомные группы, например, для @/ компонентов
            {
              pattern: 'react*', // React всегда наверху
              group: 'external',
              position: 'before',
            },
            // {
            //   pattern: '@/**', // Пример для alias '@/'
            //   group: 'internal',
            // },
          ],
          pathGroupsExcludedImportTypes: ['react'], // Не применять pathGroups к import type
          'newlines-between': 'always', // Пустая строка между группами
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-duplicates': 'error', // Запретить дублирующиеся импорты
      'import/no-unresolved': 'off', // Отключено, так как 'import/resolver' настроен для TS
      'import/named': 'off', // Отключено, так как TS это проверяет лучше

      // Общие правила
      'no-unused-vars': 'off', // Используем @typescript-eslint/no-unused-vars
      curly: ['error', 'all'], // Обязательные фигурные скобки для if/else/while/for

      // --- Убираем правила, специфичные для старого проекта ---
      'node/no-process-env': 'off', // Неактуально для фронтенда
      'no-restricted-syntax': 'off', // Правило про import.meta.env не нужно, Vite его обрабатывает
      'import/no-restricted-paths': 'off', // Убираем ограничения на пути
      '@typescript-eslint/no-restricted-imports': 'off', // Убираем ограничения на импорты
    },
  },

  // 3. Конфигурация для файлов тестов (если используете Vitest)
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    // Используем рекомендуемые правила для Vitest
    ...vitestPlugin.configs.recommended,
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      // Можно ослабить некоторые правила для тестов
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // Разрешить '!' в тестах
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // 4. Конфигурация для файлов конфигурации (vite.config.ts, eslint.config.mjs)
  {
    files: ['vite.config.ts', 'eslint.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node, // Используем окружение Node.js для этих файлов
      },
    },
    rules: {
      // Можно применить специфичные правила для конфигов
      // Например, разрешить console.log
      'no-console': 'off',
      // Правила импортов могут быть другими
      'import/order': 'off',
      // Если vite.config.ts использует TS
      '@typescript-eslint/no-var-requires': 'off', // Разрешить require, если нужно
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    }
  },
  // Правила для vite.config.ts отдельно, если нужно указать другой tsconfig
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [`${__dirname}/tsconfig.node.json`], // TSConfig для конфигов/Node.js
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      // Отключаем правила, которые могут мешать в конфигах
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    }
  },


  // 5. Конфигурация Prettier (ВАЖНО: должна идти последней!)
  // Она отключает правила ESLint, которые конфликтуют с форматированием Prettier.
  prettierConfig,
];