import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  IconBox,
  IconChevronUp,
  IconCircle,
  IconCircleCheckFilled,
  IconClock,
  IconLoader2,
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
import type { CloneStatusTask, CloneStepColors } from "./clone-status"

const DEFAULT_COLORS: CloneStepColors = {
  text: "text-primary dark:text-primary",
  border: "border-primary dark:border-primary",
  bg: "bg-primary dark:bg-primary",
  soft: "bg-primary/10 dark:bg-primary/10",
}

type CloneStatusItemProps = {
  title: ReactNode
  tasks: Array<CloneStatusTask>
  isCloning: boolean
  isFinished: boolean
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
  colors = DEFAULT_COLORS,
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
            isCloning ? colors.text : "text-muted-foreground",
            isCloning ? colors.soft : "bg-muted"
          )}
        >
          <AnimatePresence mode="wait">
            {isCloning && !isFinished ? (
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
                  <IconCircleCheckFilled size={24} className="text-primary" />
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
            <AnimatePresence initial={false} mode="wait">
              {showDetails ? (
                <motion.div
                  key="tasks"
                  animate="show"
                  className="mt-1 flex flex-col gap-3"
                  exit={{
                    opacity: 0,
                    filter: "blur(4px)",
                    y: -4,
                    transition: { duration: 0.1 },
                  }}
                  initial="hidden"
                  variants={stagger.container}
                >
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
                          <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                        ) : (
                          <IconCircle className="size-5 text-muted-foreground" />
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
                </motion.div>
              ) : (
                <motion.div
                  key="summary"
                  animate="show"
                  exit={{
                    opacity: 0,
                    filter: "blur(4px)",
                    y: 4,
                    transition: { duration: 0.1 },
                  }}
                  initial="hidden"
                  layout
                  variants={stagger.item}
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {isCloning ? (
                      isFinished ? (
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
                </motion.div>
              )}
            </AnimatePresence>
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
