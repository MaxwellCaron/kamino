import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  CircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { useCutoutContentStaggerVariants } from "@workspace/ui/components/cutout-card"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"
import type { CloneStatusTask } from "@/features/pods/types/clone-status"
import type { ProgressStepColors } from "@/components/progress-state/progress-state-colors"
import {
  DEFAULT_PROGRESS_COLORS,
  FAILED_PROGRESS_COLORS,
  IDLE_PROGRESS_COLORS,
} from "@/components/progress-state/progress-state-colors"

type CloneStatusItemProps = {
  title: ReactNode
  tasks: Array<CloneStatusTask>
  isFinished: boolean
  isFailed?: boolean
  colors?: ProgressStepColors
  defaultExpanded?: boolean
  className?: string
}

export function CloneStatusItem({
  title,
  tasks,
  isFailed = false,
  colors = DEFAULT_PROGRESS_COLORS,
  className,
}: CloneStatusItemProps) {
  const stagger = useCutoutContentStaggerVariants()
  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length
  const totalTasks = tasks.length

  return (
    <Item
      variant="muted"
      role="listitem"
      className={cn("shadow ring-1 ring-muted", className)}
    >
      <m.div layout className="contents">
        <ItemContent>
          <ItemTitle className="line-clamp-1 text-base font-semibold">
            {title}
          </ItemTitle>
          <ItemDescription className="flex flex-col gap-3 overflow-hidden pt-2">
            <div key="tasks" className="mt-1 flex flex-col gap-3">
              {tasks.map((task) => (
                <m.div
                  key={task.id}
                  className="flex items-center gap-3 text-sm"
                  variants={stagger.item}
                >
                  <div className="flex-none">
                    {task.status === "completed" ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        className={cn(
                          "size-5 transition-colors duration-500",
                          colors.text
                        )}
                      />
                    ) : task.status === "in-progress" ? (
                      isFailed ? (
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          className={cn("size-5", FAILED_PROGRESS_COLORS.text)}
                        />
                      ) : (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          className={cn(
                            "size-5 animate-spin",
                            IDLE_PROGRESS_COLORS.text
                          )}
                        />
                      )
                    ) : (
                      <HugeiconsIcon
                        icon={CircleIcon}
                        className={cn("size-5", IDLE_PROGRESS_COLORS.text)}
                      />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn("truncate", {
                        "font-semibold text-foreground":
                          task.status === "in-progress",
                        "text-foreground":
                          task.status === "pending" ||
                          task.status === "in-progress",
                        "text-muted-foreground line-through":
                          task.status === "completed",
                      })}
                    >
                      {task.name}
                    </span>
                  </div>
                </m.div>
              ))}
            </div>
          </ItemDescription>
        </ItemContent>
        <ItemContent className="flex-none self-start pt-0.5 text-center">
          <ItemDescription>
            <Badge
              variant="ghost"
              className="text-muted-foreground tabular-nums"
            >
              {completedTasks} / {totalTasks}
            </Badge>
          </ItemDescription>
        </ItemContent>
      </m.div>
    </Item>
  )
}
