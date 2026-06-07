import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

type CreatePodFormSectionProps = {
  number: number
  title: ReactNode
  children: ReactNode
  isLast?: boolean
}

export function CreatePodFormSection({
  number,
  title,
  children,
  isLast = false,
}: CreatePodFormSectionProps) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      <div className="relative flex justify-center">
        <div
          className={cn(
            "absolute top-8 w-px bg-border",
            isLast ? "bottom-0" : "-bottom-8"
          )}
        />
        <div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-4 ring-background">
          {number}
        </div>
      </div>
      <div className={cn("min-w-0", isLast ? "pb-6" : "pb-10")}>
        <h2 className="mb-4 text-lg font-semibold tracking-normal">{title}</h2>
        {children}
      </div>
    </section>
  )
}
