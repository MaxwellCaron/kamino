"use client"

import { cva } from "class-variance-authority"
import * as React from "react"
import {
  formatRelativeTime,
  getRelativeTimeUpdateDelay,
} from "@workspace/ui/components/relative-time-schedule"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { cn } from "@workspace/ui/lib/utils"
import type { VariantProps } from "class-variance-authority"

interface TimezoneCardProps extends React.ComponentProps<"div"> {
  date: Date
  timezone?: string
}

function TimezoneCard(props: TimezoneCardProps) {
  const { date, timezone, ...cardProps } = props

  const locale = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().locale,
    []
  )

  const timezoneName = React.useMemo(
    () =>
      timezone ??
      new Intl.DateTimeFormat(locale, { timeZoneName: "shortOffset" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value,
    [date, timezone, locale]
  )

  const { formattedDate, formattedTime } = React.useMemo(
    () => ({
      formattedDate: new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: timezone,
      }).format(date),
      formattedTime: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: timezone,
      }).format(date),
    }),
    [date, timezone, locale]
  )

  return (
    <div
      role="region"
      aria-label={`Time in ${timezoneName}: ${formattedDate} ${formattedTime}`}
      {...cardProps}
      className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <span className="w-fit rounded bg-secondary px-1 text-xs font-medium">
        {timezoneName}
      </span>
      <div className="flex items-center gap-2">
        <time dateTime={date.toISOString()}>{formattedDate}</time>
        <time className="tabular-nums" dateTime={date.toISOString()}>
          {formattedTime}
        </time>
      </div>
    </div>
  )
}

const triggerVariants = cva(
  "inline-flex w-fit items-center justify-center text-sm text-foreground/70 transition-colors hover:text-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
  {
    variants: {
      variant: {
        default: "",
        muted: "text-foreground/50 hover:text-foreground/70",
        ghost: "hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface RelativeTimeCardProps
  extends
    React.ComponentProps<typeof HoverCard>,
    React.ComponentProps<typeof HoverCardTrigger>,
    Pick<
      React.ComponentProps<typeof HoverCardContent>,
      "align" | "side" | "alignOffset" | "sideOffset"
    >,
    VariantProps<typeof triggerVariants> {
  date: Date | string | number
  timezones?: Array<string>
  updateInterval?: number
  className?: string
  children?: React.ReactNode
  display?: "absolute" | "relative"
}

function RelativeTimeCard(props: RelativeTimeCardProps) {
  const {
    date: dateProp,
    variant,
    timezones = ["UTC"],
    open,
    defaultOpen,
    onOpenChange,
    delay = 500,
    closeDelay = 300,
    align,
    side,
    alignOffset,
    sideOffset,
    render,
    children,
    display = "absolute",
    className,
    ...triggerProps
  } = props

  const date = React.useMemo(
    () => (dateProp instanceof Date ? dateProp : new Date(dateProp)),
    [dateProp]
  )

  const locale = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().locale,
    []
  )

  const absoluteFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  )

  const [formattedTime, setFormattedTime] = React.useState(() =>
    display === "relative" ? formatRelativeTime(date) : ""
  )

  React.useEffect(() => {
    if (display !== "relative") return

    let timeoutId = 0

    const schedule = () => {
      setFormattedTime(formatRelativeTime(date))
      const updateDelay = getRelativeTimeUpdateDelay(date)
      if (updateDelay === null) return
      timeoutId = window.setTimeout(schedule, updateDelay)
    }

    schedule()

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [date, display])

  const hoverRelativeTime =
    display === "relative" ? formattedTime : formatRelativeTime(date)

  return (
    <HoverCard
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <HoverCardTrigger
        {...triggerProps}
        delay={delay}
        closeDelay={closeDelay}
        render={render ?? <button type="button" />}
        className={cn(triggerVariants({ variant, className }))}
      >
        {children ?? (
          <time dateTime={date.toISOString()} suppressHydrationWarning>
            {display === "relative"
              ? formattedTime
              : absoluteFormatter.format(date)}
          </time>
        )}
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="flex w-full max-w-105 flex-col gap-2 p-3"
      >
        <time
          dateTime={date.toISOString()}
          className="text-sm text-muted-foreground"
        >
          {hoverRelativeTime}
        </time>
        <div role="list" className="flex flex-col gap-1">
          {timezones.map((timezone) => (
            <TimezoneCard
              key={timezone}
              role="listitem"
              date={date}
              timezone={timezone}
            />
          ))}
          <TimezoneCard role="listitem" date={date} />
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

export { RelativeTimeCard }
