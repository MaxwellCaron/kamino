import { createContext, useContext } from "react"
import type { RefObject } from "react"

export const pieCssVars = {
  background: "var(--chart-background)",
  foreground: "var(--chart-foreground)",
  foregroundMuted: "var(--chart-foreground-muted)",
  label: "var(--chart-label)",
  slice1: "var(--chart-1)",
  slice2: "var(--chart-2)",
  slice3: "var(--chart-3)",
  slice4: "var(--chart-4)",
  slice5: "var(--chart-5)",
}

export const defaultPieColors = [
  pieCssVars.slice1,
  pieCssVars.slice2,
  pieCssVars.slice3,
  pieCssVars.slice4,
  pieCssVars.slice5,
]

export interface PieData {
  label: string
  /** Value for the slice (determines slice size relative to total) */
  value: number
  /** Optional color override - falls back to palette */
  color?: string
  /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
  fill?: string
  className?: string
}

export interface PieArcData {
  data: PieData
  index: number
  startAngle: number
  endAngle: number
  padAngle: number
  value: number
}

export interface PieContextValue {
  data: Array<PieData>
  arcs: Array<PieArcData>

  size: number
  center: number
  outerRadius: number
  innerRadius: number
  padAngle: number
  cornerRadius: number

  hoverOffset: number

  hoveredIndex: number | null
  setHoveredIndex: (index: number | null) => void

  animationKey: number
  isLoaded: boolean

  // Container ref for portals
  containerRef: RefObject<HTMLDivElement | null>

  totalValue: number

  getColor: (index: number) => string

  getFill: (index: number) => string
}

const PieContext = createContext<PieContextValue | null>(null)

export function PieProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: PieContextValue
}) {
  return <PieContext.Provider value={value}>{children}</PieContext.Provider>
}

export function usePie(): PieContextValue {
  const context = useContext(PieContext)
  if (!context) {
    throw new Error(
      "usePie must be used within a PieProvider. " +
        "Make sure your component is wrapped in <PieChart>."
    )
  }
  return context
}
