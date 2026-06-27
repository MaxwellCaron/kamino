import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert01Icon,
  AlertDiamondIcon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Loading01Icon,
} from "@hugeicons/core-free-icons"
import type { ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            className="size-4 text-emerald-600 dark:text-emerald-400"
          />
        ),
        info: (
          <HugeiconsIcon
            icon={InformationCircleIcon}
            className="size-4 text-teal-600 dark:text-teal-400"
          />
        ),
        warning: (
          <HugeiconsIcon
            icon={Alert01Icon}
            className="size-4 text-amber-600 dark:text-amber-400"
          />
        ),
        error: (
          <HugeiconsIcon
            icon={AlertDiamondIcon}
            className="size-4 text-destructive"
          />
        ),
        loading: (
          <HugeiconsIcon
            icon={Loading01Icon}
            className="size-4 animate-spin text-muted-foreground"
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast rounded-4xl! px-6! py-4!",
          success:
            "border-emerald-600/20! dark:border-emerald-400/20!text-emerald-600! dark:text-emerald-400!",
          error: "border-destructive/50! text-destructive!",
          warning:
            "border-amber-600/20! dark:border-amber-400/20! text-amber-600! dark:text-amber-400!",
          info: "border-teal-600/20! dark:border-teal-400/20! text-teal-600! dark:text-teal-400!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
