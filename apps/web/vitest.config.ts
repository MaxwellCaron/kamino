import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    pool: "vmThreads",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      "@workspace/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
    },
  },
})
