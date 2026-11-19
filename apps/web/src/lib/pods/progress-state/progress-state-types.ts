import type { IconSvgElement } from "@hugeicons/react"
import type { MouseEventHandler } from "react"

export type ProgressStateStep<TStepId extends number = number> = {
  id: TStepId
  title: string
  description: string
}

export type ProgressStateSteps<TStepId extends number = number> = readonly [
  ProgressStateStep<TStepId>,
  ...Array<ProgressStateStep<TStepId>>,
]

type ProgressStateActionBase = {
  icon: IconSvgElement
  label: string
  variant?: "default" | "secondary" | "outline"
}

type ProgressStateStaticAction = ProgressStateActionBase & {
  onClick?: MouseEventHandler<HTMLAnchorElement>
  to: "/" | "/pods/create" | "/pods/published"
}

type ProgressStatePodAction = ProgressStateActionBase & {
  onClick?: MouseEventHandler<HTMLAnchorElement>
  params: { podSlug: string }
  to: "/pods/$podSlug"
}

type ProgressStateInventoryItemAction = ProgressStateActionBase & {
  onClick?: MouseEventHandler<HTMLAnchorElement>
  params: { itemId: string }
  to: "/inventory/items/$itemId"
}

type ProgressStateButtonAction = ProgressStateActionBase & {
  onClick: MouseEventHandler<HTMLButtonElement>
}

export type ProgressStateAction =
  | ProgressStateStaticAction
  | ProgressStatePodAction
  | ProgressStateInventoryItemAction
  | ProgressStateButtonAction
