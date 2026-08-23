import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "sort-imports": "warn",
    },
  },
  {
    files: [
      "src/components/charts/**/*.{ts,tsx}",
      "src/components/shimmering-text.tsx",
    ],
    rules: {
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "no-shadow": "off",
    },
  },
]
