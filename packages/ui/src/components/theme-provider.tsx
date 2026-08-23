import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  // null until the client resolves "system" via matchMedia, keeping SSR/hydration in sync
  resolvedTheme: ResolvedTheme | null
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: null,
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function isTheme(theme: string | null): theme is Theme {
  return theme === "dark" || theme === "light" || theme === "system"
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme =
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : null

    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | null>(
    null
  )

  useEffect(() => {
    const root = window.document.documentElement

    const applyResolvedTheme = (nextResolvedTheme: ResolvedTheme) => {
      root.classList.remove("light", "dark")
      root.classList.add(nextResolvedTheme)
      root.style.colorScheme = nextResolvedTheme
      setResolvedTheme(nextResolvedTheme)
    }

    if (theme !== "system") {
      applyResolvedTheme(theme)
      return
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyResolvedTheme(query.matches ? "dark" : "light")

    onChange()
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [theme])

  const value = {
    theme,
    resolvedTheme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  return useContext(ThemeProviderContext)
}
