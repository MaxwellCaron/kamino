import { defineConfig, loadEnv } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import type { Plugin } from "vite"

const NOVNC_MOUSE_MOVE_DELAY_MS = 8

function tuneNovncForPerformance(): Plugin {
  return {
    name: "novnc-performance",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@novnc/novnc") || !id.endsWith("/rfb.js")) {
        return null
      }
      if (!code.includes("const MOUSE_MOVE_DELAY = 17")) {
        return null
      }
      return {
        code: code.replace(
          "const MOUSE_MOVE_DELAY = 17",
          `const MOUSE_MOVE_DELAY = ${NOVNC_MOUSE_MOVE_DELAY_MS}`
        ),
        map: null,
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiProxyTarget = env.API_PROXY_TARGET || "http://localhost:8080"

  return {
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      forwardConsole: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    plugins: [
      tuneNovncForPerformance(),
      tailwindcss(),
      tanstackStart({ spa: { enabled: true } }),
      viteReact(),
    ],
  }
})
