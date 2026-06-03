import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  IconBox,
  IconChevronUp,
  IconCircle,
  IconCircleCheckFilled,
  IconClock,
  IconLoader2,
  IconX,
  IconXFilled,
} from "@tabler/icons-react"
import { Loader } from "@dot-loaders/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { useCutoutContentStaggerVariants } from "@workspace/ui/components/cutout-card"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"
import type {
  CloneStatusTask,
  CloneStepColors,
} from "@/features/pods/types/clone-status"
import {
  COMPLETE_CLONE_COLORS,
  DEFAULT_CLONE_COLORS,
  FAILED_CLONE_COLORS,
  IDLE_CLONE_COLORS,
} from "@/features/pods/types/clone-status"

type CloneStatusItemProps = {
  title: ReactNode
  tasks: Array<CloneStatusTask>
  isCloning: boolean
  isFinished: boolean
  isFailed?: boolean
  colors?: CloneStepColors
  elapsedTime?: string
  defaultExpanded?: boolean
  className?: string
}

export function CloneStatusItem({
  title,
  tasks,
  isCloning,
  isFinished,
  isFailed = false,
  colors = DEFAULT_CLONE_COLORS,
  elapsedTime,
  defaultExpanded = true,
  className,
}: CloneStatusItemProps) {
  const [showDetails, setShowDetails] = useState(defaultExpanded)
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
      <motion.div layout className="contents">
        <ItemMedia
          variant="image"
          className={cn(
            "transition-colors duration-500",
            isFailed
              ? cn(FAILED_CLONE_COLORS.soft, FAILED_CLONE_COLORS.text)
              : isCloning
                ? colors.text
                : IDLE_CLONE_COLORS.text,
            isFailed ? null : isCloning ? colors.soft : IDLE_CLONE_COLORS.bg
          )}
        >
          <AnimatePresence mode="wait">
            {isFailed ? (
              <motion.div
                key="failed-icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <IconXFilled size={24} />
              </motion.div>
            ) : isCloning && !isFinished ? (
              <motion.div
                key="sand-loader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader
                  loader="sand"
                  renderer="svg-grid"
                  speed={0.85}
                  rendererOptions={{
                    shape: "square",
                    cellSize: 4,
                    gap: 1,
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="box-icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {isFinished ? (
                  <IconCircleCheckFilled
                    size={24}
                    className={COMPLETE_CLONE_COLORS.text}
                  />
                ) : (
                  <IconBox size={24} stroke={1.5} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="line-clamp-1">{title}</ItemTitle>
          <ItemDescription className="flex flex-col gap-3 overflow-hidden">
            {showDetails ? (
              <div key="tasks" className="mt-1 flex flex-col gap-3">
                {tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    className="flex items-center gap-3 text-sm"
                    variants={stagger.item}
                  >
                    <div className="flex-none">
                      {task.status === "completed" ? (
                        <IconCircleCheckFilled
                          className={cn(
                            "size-5 transition-colors duration-500",
                            colors.text
                          )}
                        />
                      ) : task.status === "in-progress" ? (
                        isFailed ? (
                          <IconX
                            className={cn("size-5", FAILED_CLONE_COLORS.text)}
                          />
                        ) : (
                          <IconLoader2
                            className={cn(
                              "size-5 animate-spin",
                              IDLE_CLONE_COLORS.text
                            )}
                          />
                        )
                      ) : (
                        <IconCircle
                          className={cn("size-5", IDLE_CLONE_COLORS.text)}
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
                  </motion.div>
                ))}
              </div>
            ) : (
              <div key="summary">
                <span className="text-sm font-medium text-muted-foreground">
                  {isCloning ? (
                    isFailed ? (
                      "Clone failed"
                    ) : isFinished ? (
                      "Clone completed successfully"
                    ) : (
                      <>
                        Step {completedTasks + 1} / {totalTasks}
                      </>
                    )
                  ) : (
                    "Ready to clone"
                  )}
                </span>
              </div>
            )}
          </ItemDescription>
        </ItemContent>
        {isCloning && elapsedTime ? (
          <ItemContent className="flex-none self-start pt-0.5 text-center">
            <ItemDescription>
              <Badge variant="outline" className="font-mono">
                <IconClock />
                {elapsedTime}
              </Badge>
            </ItemDescription>
          </ItemContent>
        ) : null}
        <ItemFooter className="justify-center">
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setShowDetails((current) => !current)}
          >
            <IconChevronUp
              data-icon="inline-start"
              className={cn("transition-transform duration-200", {
                "rotate-180": !showDetails,
              })}
            />
            {showDetails ? "Hide" : "Show"}
          </Button>
        </ItemFooter>
      </motion.div>
    </Item>
  )
}
