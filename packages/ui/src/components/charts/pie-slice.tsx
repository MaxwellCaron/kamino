import { m, useSpring, useTransform } from "motion/react"
import { useEffect, useRef } from "react"
import { arc as arcGenerator } from "@visx/shape"
import { usePie } from "./pie-context"

function generateArcPath(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  cornerRadius: number,
  padAngle: number
): string {
  const generator = arcGenerator<unknown>({
    innerRadius,
    outerRadius,
    cornerRadius,
    padAngle,
  })
  return generator({ startAngle, endAngle }) || ""
}

function getSliceOffset(
  startAngle: number,
  endAngle: number,
  distance: number
): { x: number; y: number } {
  const midAngle = (startAngle + endAngle) / 2
  // In d3-shape, 0 radians is at 12 o'clock, angles increase clockwise
  // So the outward direction is: x = sin(angle), y = -cos(angle)
  return {
    x: Math.sin(midAngle) * distance,
    y: -Math.cos(midAngle) * distance,
  }
}

export type PieSliceHoverEffect = "translate" | "grow" | "none"

export interface PieSliceProps {
  /** Index of the slice in the data array */
  index: number
  /** Optional color override - falls back to data color or palette */
  color?: string
  /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
  fill?: string
  className?: string
  /** Animate the slice on mount. Default: true */
  animate?: boolean
  /** Show glow effect on hover. Default: true */
  showGlow?: boolean
  /**
   * Hover effect type. Default: "translate"
   * - "translate": Slice moves outward along its radial axis
   * - "grow": Slice extends its outer radius (gets longer)
   * - "none": No hover animation
   */
  hoverEffect?: PieSliceHoverEffect
  /** Distance in pixels for hover effect (translate distance or grow amount). Defaults to PieChart's hoverOffset */
  hoverOffset?: number
}

interface AnimatedSliceTranslateProps {
  index: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  cornerRadius: number
  padAngle: number
  fill: string
  color: string
  isHovered: boolean
  isFaded: boolean
  animationKey: number
  showGlow: boolean
  hoverOffset: number
  className?: string
}

function AnimatedSliceTranslate({
  index,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  cornerRadius,
  padAngle,
  fill,
  color,
  isHovered,
  isFaded,
  animationKey,
  showGlow,
  hoverOffset,
  className,
}: AnimatedSliceTranslateProps) {
  const animationDelay = 0.1 + index * 0.08

  const mountSpring = useSpring(0, {
    stiffness: 60,
    damping: 20,
    restDelta: 0.001,
  })

  useEffect(() => {
    mountSpring.jump(0)
    const timeout = setTimeout(() => {
      mountSpring.set(1)
    }, animationDelay * 1000)
    return () => clearTimeout(timeout)
  }, [animationDelay, mountSpring])

  const animatedPath = useTransform(mountSpring, (mount) => {
    const currentEndAngle = startAngle + (endAngle - startAngle) * mount
    if (currentEndAngle <= startAngle + 0.01) {
      return ""
    }
    return generateArcPath(
      innerRadius,
      outerRadius,
      startAngle,
      currentEndAngle,
      cornerRadius,
      padAngle
    )
  })

  const offset = getSliceOffset(startAngle, endAngle, hoverOffset)
  const glowColor = color

  return (
    <m.path
      animate={{
        opacity: isFaded ? 0.4 : 1,
        x: isHovered ? offset.x : 0,
        y: isHovered ? offset.y : 0,
      }}
      initial={{ opacity: 1, x: 0, y: 0 }}
      d={animatedPath}
      fill={className ? undefined : fill}
      className={className}
      key={`slice-${animationKey}-${index}`}
      pointerEvents="none"
      style={{
        filter:
          showGlow && isHovered && glowColor !== "currentColor"
            ? `drop-shadow(0 0 12px ${glowColor})`
            : "none",
      }}
      transition={{
        opacity: { duration: 0.15 },
        x: { type: "spring", stiffness: 400, damping: 25 },
        y: { type: "spring", stiffness: 400, damping: 25 },
      }}
    />
  )
}

interface AnimatedSliceGrowProps {
  index: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  cornerRadius: number
  padAngle: number
  fill: string
  color: string
  isHovered: boolean
  isFaded: boolean
  animationKey: number
  showGlow: boolean
  hoverOffset: number
  className?: string
}

function AnimatedSliceGrow({
  index,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  cornerRadius,
  padAngle,
  fill,
  color,
  isHovered,
  isFaded,
  animationKey,
  showGlow,
  hoverOffset,
  className,
}: AnimatedSliceGrowProps) {
  const animationDelay = 0.1 + index * 0.08

  const mountSpring = useSpring(0, {
    stiffness: 60,
    damping: 20,
    restDelta: 0.001,
  })

  const growSpring = useSpring(outerRadius, {
    stiffness: 400,
    damping: 25,
  })

  useEffect(() => {
    mountSpring.jump(0)
    const timeout = setTimeout(() => {
      mountSpring.set(1)
    }, animationDelay * 1000)
    return () => clearTimeout(timeout)
  }, [animationDelay, mountSpring])

  useEffect(() => {
    growSpring.set(isHovered ? outerRadius + hoverOffset : outerRadius)
  }, [isHovered, hoverOffset, outerRadius, growSpring])

  const animatedPath = useTransform(
    [mountSpring, growSpring],
    ([mount, currentOuterRadius]) => {
      const currentEndAngle =
        startAngle + (endAngle - startAngle) * (mount as number)
      if (currentEndAngle <= startAngle + 0.01) {
        return ""
      }
      return generateArcPath(
        innerRadius,
        currentOuterRadius as number,
        startAngle,
        currentEndAngle,
        cornerRadius,
        padAngle
      )
    }
  )

  const glowColor = color

  return (
    <m.path
      animate={{
        opacity: isFaded ? 0.4 : 1,
      }}
      initial={{ opacity: 1 }}
      d={animatedPath}
      fill={className ? undefined : fill}
      className={className}
      key={`slice-${animationKey}-${index}`}
      pointerEvents="none"
      style={{
        filter:
          showGlow && isHovered && glowColor !== "currentColor"
            ? `drop-shadow(0 0 12px ${glowColor})`
            : "none",
      }}
      transition={{
        opacity: { duration: 0.15 },
      }}
    />
  )
}

export function PieSlice({
  index,
  color: colorProp,
  fill: fillProp,
  className: classNameProp,
  animate = true,
  showGlow = true,
  hoverEffect = "translate",
  hoverOffset: hoverOffsetProp,
}: PieSliceProps) {
  const {
    data,
    arcs,
    innerRadius,
    outerRadius,
    cornerRadius,
    hoverOffset: contextHoverOffset,
    hoveredIndex,
    setHoveredIndex,
    animationKey,
    getColor,
    getFill,
  } = usePie()

  const hoverOffset = hoverOffsetProp ?? contextHoverOffset

  const hasAnimated = useRef(false)
  const sliceExpandDelay = index * 0.08

  useEffect(() => {
    if (animate && !hasAnimated.current) {
      const timeout = setTimeout(
        () => {
          hasAnimated.current = true
        },
        (sliceExpandDelay + 0.5) * 1000
      )
      return () => clearTimeout(timeout)
    }
  }, [animate, sliceExpandDelay])

  const arcData = arcs[index]
  const item = data[index]

  const className = classNameProp || item.className
  const color = colorProp || getColor(index)
  const fill = fillProp || getFill(index)

  const isHovered = hoveredIndex === index
  const isFaded = hoveredIndex !== null && hoveredIndex !== index

  const offset = getSliceOffset(
    arcData.startAngle,
    arcData.endAngle,
    hoverOffset
  )

  const hitboxPath = generateArcPath(
    innerRadius,
    outerRadius,
    arcData.startAngle,
    arcData.endAngle,
    cornerRadius,
    arcData.padAngle
  )

  const grownOuterRadius = isHovered ? outerRadius + hoverOffset : outerRadius
  const grownPath = generateArcPath(
    innerRadius,
    grownOuterRadius,
    arcData.startAngle,
    arcData.endAngle,
    cornerRadius,
    arcData.padAngle
  )

  const renderAnimatedSlice = () => {
    if (hoverEffect === "grow") {
      return (
        <AnimatedSliceGrow
          animationKey={animationKey}
          color={color}
          cornerRadius={cornerRadius}
          endAngle={arcData.endAngle}
          fill={fill}
          hoverOffset={hoverOffset}
          index={index}
          innerRadius={innerRadius}
          isFaded={isFaded}
          isHovered={isHovered}
          outerRadius={outerRadius}
          padAngle={arcData.padAngle}
          showGlow={showGlow}
          startAngle={arcData.startAngle}
          className={className}
        />
      )
    }

    return (
      <AnimatedSliceTranslate
        animationKey={animationKey}
        color={color}
        cornerRadius={cornerRadius}
        endAngle={arcData.endAngle}
        fill={fill}
        hoverOffset={hoverEffect === "none" ? 0 : hoverOffset}
        index={index}
        innerRadius={innerRadius}
        isFaded={isFaded}
        isHovered={isHovered}
        outerRadius={outerRadius}
        padAngle={arcData.padAngle}
        showGlow={showGlow}
        startAngle={arcData.startAngle}
        className={className}
      />
    )
  }

  const renderStaticSlice = () => {
    if (hoverEffect === "grow") {
      return (
        <m.path
          animate={{
            opacity: isFaded ? 0.4 : 1,
            d: grownPath,
          }}
          initial={{ opacity: 1, d: hitboxPath }}
          d={hitboxPath}
          fill={className ? undefined : fill}
          className={className}
          pointerEvents="none"
          style={{
            filter:
              showGlow && isHovered && color !== "currentColor"
                ? `drop-shadow(0 0 12px ${color})`
                : "none",
          }}
          transition={{
            opacity: { duration: 0.15 },
            d: { type: "spring", stiffness: 400, damping: 25 },
          }}
        />
      )
    }

    const shouldTranslate = hoverEffect !== "none" && isHovered
    const translateX = shouldTranslate ? offset.x : 0
    const translateY = shouldTranslate ? offset.y : 0

    return (
      <m.path
        animate={{
          opacity: isFaded ? 0.4 : 1,
          x: translateX,
          y: translateY,
        }}
        initial={{ opacity: 1, x: 0, y: 0 }}
        d={hitboxPath}
        fill={className ? undefined : fill}
        className={className}
        pointerEvents="none"
        style={{
          filter:
            showGlow && isHovered && color !== "currentColor"
              ? `drop-shadow(0 0 12px ${color})`
              : "none",
          color: color === "currentColor" ? undefined : color,
        }}
        transition={{
          opacity: { duration: 0.15 },
          x: { type: "spring", stiffness: 400, damping: 25 },
          y: { type: "spring", stiffness: 400, damping: 25 },
        }}
      />
    )
  }

  return (
    <g style={{ cursor: "pointer" }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as hover hitbox for visualization */}
      <path
        d={hitboxPath}
        fill="transparent"
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
      />

      {animate ? renderAnimatedSlice() : renderStaticSlice()}
    </g>
  )
}

PieSlice.displayName = "PieSlice"

export default PieSlice
