"use client"

import { m, useReducedMotion } from "motion/react"
import { useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"
import type { Variants } from "motion/react"
import type { ComponentProps } from "react"

export type ShimmeringTextProps = Omit<
  ComponentProps<typeof m.span>,
  "children"
> & {
  /** The text to render with the shimmering effect. */
  text: string
  /**
   * Duration in seconds for one shimmer cycle.
   * @defaultValue 1
   */
  duration?: number
  /**
   * Whether the shimmer animation is paused.
   * @defaultValue false
   */
  isStopped?: boolean
}

export function ShimmeringText({
  text,
  duration = 1,
  isStopped = false,
  className,
  ...props
}: ShimmeringTextProps) {
  const reducedMotion = useReducedMotion()
  const stopped = isStopped || reducedMotion === true

  const createCharVariants = useCallback(
    (charIndex: number): Variants => ({
      running: {
        color: ["var(--color)", "var(--shimmering-color)", "var(--color)"],
        transition: {
          duration,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "loop",
          repeatDelay: text.length * 0.05,
          delay: (charIndex * duration) / text.length,
          ease: "easeInOut",
        },
      },
      stopped: {
        color: "var(--color)",
        transition: {
          duration: duration * 0.5,
          ease: "easeOut",
        },
      },
    }),
    [duration, text.length]
  )

  return (
    <m.span
      className={cn(
        "inline-flex items-center leading-none select-none",
        "[--color:var(--muted-foreground)] [--shimmering-color:var(--foreground)]",
        className
      )}
      {...props}
    >
      {text.split("").map((char, index) => (
        <m.span
          animate={stopped ? "stopped" : "running"}
          aria-hidden
          className="inline-block leading-none whitespace-pre"
          initial="stopped"
          // biome-ignore lint/suspicious/noArrayIndexKey: static label text, order never changes
          key={index}
          variants={createCharVariants(index)}
        >
          {char}
        </m.span>
      ))}
      <span className="sr-only">{text}</span>
    </m.span>
  )
}
