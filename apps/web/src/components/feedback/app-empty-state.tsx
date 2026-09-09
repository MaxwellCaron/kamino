import { HugeiconsIcon } from "@hugeicons/react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import type { IconSvgElement } from "@hugeicons/react"
import type { ComponentProps, ReactNode } from "react"

type AppEmptyStateProps = ComponentProps<typeof Empty> & {
  description: ReactNode
  icon: IconSvgElement
  iconClassName?: string
  mediaClassName?: string
  title: ReactNode
}

export function AppEmptyState({
  description,
  icon,
  iconClassName = "text-muted-foreground",
  mediaClassName,
  title,
  ...props
}: AppEmptyStateProps) {
  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className={mediaClassName}>
          <HugeiconsIcon icon={icon} className={iconClassName} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
