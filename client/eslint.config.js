// ESLint v9 flat config (migrated from legacy .eslintrc.cjs)
//
// The v9 upgrade dropped .eslintrc support and requires this flat-array
// format. Preserves the original rule set: eslint:recommended, react,
// react/jsx-runtime, react-hooks/recommended, react-refresh guardrail,
// plus the project-specific overrides (unused args prefixed _, no-console
// except warn/error).

import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist/**", "node_modules/**"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: { version: "18.3" },
    },
    rules: {
      // eslint-plugin-react: spread both recommended + jsx-runtime rule sets.
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      // react-hooks: enforce rules-of-hooks + exhaustive-deps.
      ...reactHooks.configs.recommended.rules,
      // Project overrides preserved verbatim from the old config.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Stylistic rule — codebase uses apostrophes freely in JSX copy;
      // escape churn would be massive and low-value.
      "react/no-unescaped-entities": "off",
    },
  },
];
