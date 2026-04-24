//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "sort-imports": "warn",
    },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.server.json",
      },
    },
  },
]
