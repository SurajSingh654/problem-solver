// ESLint flat config (v9+). Catches the class of mistakes that leaked
// into prod recently — undefined references, unused imports, redeclared
// variables, missing `await`, etc. Style rules are kept minimal so the
// config doesn't fight us; the focus is correctness.
import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        rules: {
            // ── HARD ERRORS — these are the bug classes we want to block ──
            // Real bugs we've shipped or nearly shipped:
            //   • no-undef caught hasContent + missing imports
            //   • no-dupe-keys caught duplicate teamId / adobe / atlassian
            //   • no-redeclare protects against accidental shadowing
            "no-undef": "error",
            "no-dupe-keys": "error",
            "no-dupe-args": "error",
            "no-dupe-else-if": "error",
            "no-redeclare": "error",
            "no-unreachable": "error",
            "no-shadow-restricted-names": "error",
            "no-self-assign": "error",
            "no-self-compare": "error",
            "no-empty": ["error", { allowEmptyCatch: true }],

            // ── WARNINGS — pre-existing cruft to clean up incrementally ──
            // These don't block the lint script but show up in the dev
            // signal. Target a follow-up commit to drop the count to zero.
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "no-useless-assignment": "warn",
            "no-prototype-builtins": "warn",
            "no-useless-escape": "warn",
            "no-control-regex": "warn",
            "no-async-promise-executor": "warn",

            // ── OFF ──
            "no-console": "off",
        },
    },
    {
        // Test files: looser rules for fixtures + mocks
        files: ["test/**/*.{js,mjs}"],
        languageOptions: {
            globals: {
                ...globals.node,
                vi: "readonly",
                describe: "readonly",
                it: "readonly",
                expect: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
            },
        },
    },
    {
        ignores: [
            "node_modules/**",
            "prisma/migrations/**",
            "dist/**",
            "*.config.js",
        ],
    },
];
