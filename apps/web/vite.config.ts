import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    nitro({
      devProxy: {
        "/api": { target: "http://localhost:8080/api", changeOrigin: true },
      },
      routeRules: {
        "/api/**": { proxy: "http://localhost:8080/api/**" },
      },
    }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
