import {
  Children,
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import type { PieContextValue, PieData } from "./pie-context"
import { PieProvider, defaultPieColors } from "./pie-context"
import type { ReactElement, ReactNode } from "react"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import type { PieArcDatum } from "d3-shape"
import { cn } from "@workspace/ui/lib/utils"
import { pie as d3Pie } from "d3-shape"

/** Default hover offset in pixels */
export const DEFAULT_HOVER_OFFSET = 10

export interface PieChartProps {
  /** Data array - each item represents a slice */
  data: Array<PieData>
  /** Chart size in pixels. If not provided, uses parent container size */
  size?: number
  /** Inner radius for donut charts. Default: 0 (solid pie) */
  innerRadius?: number
  /** Padding angle between slices in radians. Default: 0 */
  padAngle?: number
  /** Corner radius for rounded slice edges. Default: 0 */
  cornerRadius?: number
  /** Start angle in radians. Default: -PI/2 (top) */
  startAngle?: number
  /** End angle in radians. Default: 3*PI/2 (full circle from top) */
  endAngle?: number
  className?: string
  /** Controlled hover state - index of hovered slice */
  hoveredIndex?: number | null
  onHoverChange?: (index: number | null) => void
  /**
   * Hover offset in pixels for slice hover effects.
   * This also determines the padding around the chart to prevent clipping.
   * Default: 10
   */
  hoverOffset?: number
  children: ReactNode
}

interface PieChartInnerProps {
  width: number
  height: number
  data: Array<PieData>
  innerRadius: number
  padAngle: number
  cornerRadius: number
  startAngle: number
  endAngle: number
  hoverOffset: number
  children: ReactNode
  containerRef: React.RefObject<HTMLDivElement | null>
  hoveredIndexProp?: number | null
  onHoverChange?: (index: number | null) => void
}

function isPieCenter(child: ReactNode): boolean {
  return (
    isValidElement(child) &&
    typeof child.type === "function" &&
    ((child.type as { displayName?: string }).displayName === "PieCenter" ||
      (child.type as { name?: string }).name === "PieCenter")
  )
}

function isDefsComponent(child: ReactElement): boolean {
  const displayName =
    (child.type as { displayName?: string }).displayName ||
    (child.type as { name?: string }).name ||
    ""
  return (
    displayName.includes("Gradient") ||
    displayName.includes("Pattern") ||
    displayName === "LinearGradient" ||
    displayName === "RadialGradient"
  )
}

function PieChartInner({
  width,
  height,
  data,
  innerRadius: innerRadiusProp,
  padAngle,
  cornerRadius,
  startAngle,
  endAngle,
  hoverOffset,
  children,
  containerRef,
  hoveredIndexProp,
  onHoverChange,
}: PieChartInnerProps) {
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<
    number | null
  >(null)
  const [animationKey] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  const isControlled = hoveredIndexProp !== undefined
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHoveredIndex
  const setHoveredIndex = useCallback(
    (index: number | null) => {
      if (isControlled) {
        onHoverChange?.(index)
      } else {
        setInternalHoveredIndex(index)
      }
    },
    [isControlled, onHoverChange]
  )

  const size = Math.min(width, height)
  const center = size / 2

  const padding = hoverOffset
  const outerRadius = center - padding
  const innerRadius = innerRadiusProp

  const totalValue = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  )

  const getColor = useCallback(
    (index: number) => {
      const item = data[index]
      if (item.color) {
        return item.color
      }
      return defaultPieColors[index % defaultPieColors.length]
    },
    [data]
  )

  const getFill = useCallback(
    (index: number) => {
      const item = data[index]
      if (item.fill) {
        return item.fill
      }
      return getColor(index)
    },
    [data, getColor]
  )

  const arcs = useMemo(() => {
    const pieGenerator = d3Pie<PieData>()
      .value((d: PieData) => d.value)
      .startAngle(startAngle)
      .endAngle(endAngle)
      .padAngle(padAngle)
      .sort(null) // Maintain data order

    const computed = pieGenerator(data)

    return computed.map((arc: PieArcDatum<PieData>, index: number) => ({
      data: arc.data,
      index,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      padAngle: arc.padAngle,
      value: arc.value,
    }))
  }, [data, startAngle, endAngle, padAngle])

  useState(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 100)
    return () => clearTimeout(timer)
  })

  const { svgChildren, centerChildren, defsChildren } = useMemo(() => {
    const svgNodes: Array<ReactNode> = []
    const centerNodes: Array<ReactNode> = []
    const defsNodes: Array<ReactElement> = []

    Children.forEach(children, (child) => {
      if (!isValidElement(child)) {
        svgNodes.push(child)
        return
      }

      if (isPieCenter(child)) {
        centerNodes.push(child)
      } else if (isDefsComponent(child)) {
        defsNodes.push(child)
      } else {
        svgNodes.push(child)
      }
    })

    return {
      svgChildren: svgNodes,
      centerChildren: centerNodes,
      defsChildren: defsNodes,
    }
  }, [children])

  if (size < 10) {
    return null
  }

  const contextValue: PieContextValue = {
    data,
    arcs,
    size,
    center,
    outerRadius,
    innerRadius,
    padAngle,
    cornerRadius,
    hoverOffset,
    hoveredIndex,
    setHoveredIndex,
    animationKey,
    isLoaded,
    containerRef,
    totalValue,
    getColor,
    getFill,
  }

  // Use CSS Grid stacking to layer SVG and HTML content
  // This avoids Safari's foreignObject rendering bugs
  return (
    <PieProvider value={contextValue}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr",
          gridTemplateRows: "1fr",
          width: size,
          height: size,
        }}
      >
        <svg
          aria-hidden="true"
          height={size}
          style={{ gridArea: "1 / 1" }}
          width={size}
        >
          {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

          <Group left={center} top={center}>
            {svgChildren}
          </Group>
        </svg>

        {centerChildren.length > 0 && (
          <div
            className="pointer-events-none flex items-center justify-center"
            style={{ gridArea: "1 / 1" }}
          >
            {centerChildren}
          </div>
        )}
      </div>
    </PieProvider>
  )
}

export function PieChart({
  data,
  size: fixedSize,
  innerRadius = 0,
  padAngle = 0,
  cornerRadius = 0,
  startAngle = -Math.PI / 2,
  endAngle = (3 * Math.PI) / 2,
  className = "",
  hoveredIndex,
  onHoverChange,
  hoverOffset = DEFAULT_HOVER_OFFSET,
  children,
}: PieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (fixedSize) {
    return (
      <div
        className={cn("relative flex items-center justify-center", className)}
        ref={containerRef}
        style={{ width: fixedSize, height: fixedSize }}
      >
        <PieChartInner
          containerRef={containerRef}
          cornerRadius={cornerRadius}
          data={data}
          endAngle={endAngle}
          height={fixedSize}
          hoveredIndexProp={hoveredIndex}
          hoverOffset={hoverOffset}
          innerRadius={innerRadius}
          onHoverChange={onHoverChange}
          padAngle={padAngle}
          startAngle={startAngle}
          width={fixedSize}
        >
          {children}
        </PieChartInner>
      </div>
    )
  }

  return (
    <div
      className={cn("relative aspect-square w-full", className)}
      ref={containerRef}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <PieChartInner
            containerRef={containerRef}
            cornerRadius={cornerRadius}
            data={data}
            endAngle={endAngle}
            height={height}
            hoveredIndexProp={hoveredIndex}
            hoverOffset={hoverOffset}
            innerRadius={innerRadius}
            onHoverChange={onHoverChange}
            padAngle={padAngle}
            startAngle={startAngle}
            width={width}
          >
            {children}
          </PieChartInner>
        )}
      </ParentSize>
    </div>
  )
}

PieChart.displayName = "PieChart"

export default PieChart
