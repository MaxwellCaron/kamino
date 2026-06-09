import { defineConfig, loadEnv } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

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
      tailwindcss(),
      tanstackStart({ spa: { enabled: true } }),
      viteReact(),
    ],
  }
})
