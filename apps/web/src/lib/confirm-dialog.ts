import type { IconSvgElement } from "@hugeicons/react"
import type { ReactNode } from "react"

export type ConfirmConfig = {
  title: string
  description: ReactNode
  body?: ReactNode
  actionLabel: string
  icon?: IconSvgElement
  variant?: "default" | "destructive"
  onConfirm: () => Promise<void> | void
}
