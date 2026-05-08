import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Progress } from "@workspace/ui/components/progress"
import {
  IconBox,
  IconChevronUp,
  IconCircle,
  IconCircleCheckFilled,
  IconClock,
  IconCopy,
  IconLoader2,
} from "@tabler/icons-react"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import { Loader } from "@dot-loaders/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { useCutoutContentStaggerVariants } from "@workspace/ui/components/cutout-card"
import type { Pod } from "../../types/pod-types"

const MOCK_TASKS = [
  {
    id: 1,
    name: "Fetch virtual machines in pod",
  },
  {
    id: 2,
    name: "Clone virtual machines",
  },
  {
    id: 3,
    name: "Wait for virtual machines to be ready",
  },
  { id: 4, name: "Configure router" },
]

function getStepColors(taskId?: number) {
  switch (taskId) {
    case 1:
      return {
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-600 dark:border-blue-400",
        bg: "bg-blue-600 dark:bg-blue-400",
        soft: "bg-blue-600/10 dark:bg-blue-400/10",
      }
    case 2:
      return {
        text: "text-orange-600 dark:text-orange-400",
        border: "border-orange-600 dark:border-orange-400",
        bg: "bg-orange-600 dark:bg-orange-400",
        soft: "bg-orange-600/10 dark:bg-orange-400/10",
      }
    case 3:
      return {
        text: "text-amber-600 dark:text-amber-400",
        border: "border-amber-600 dark:border-amber-400",
        bg: "bg-amber-600 dark:bg-amber-400",
        soft: "bg-amber-600/10 dark:bg-amber-400/10",
      }
    case 4:
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-600 dark:border-emerald-400",
        bg: "bg-emerald-600 dark:bg-emerald-400",
        soft: "bg-emerald-600/10 dark:bg-emerald-400/10",
      }
    default:
      return {
        text: "text-primary dark:text-primary",
        border: "border-primary dark:border-primary",
        bg: "bg-primary dark:bg-primary",
        soft: "bg-primary/10 dark:bg-primary/10",
      }
  }
}

function useCloneSimulation(open: boolean) {
  const [isCloning, setIsCloning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)

  const tasks = MOCK_TASKS.map((task) => {
    if (!isCloning) return { ...task, status: "pending" }
    if (currentStep > task.id) return { ...task, status: "completed" }
    if (currentStep === task.id) return { ...task, status: "in-progress" }
    return { ...task, status: "pending" }
  })

  const completedTasks = tasks.filter((t) => t.status === "completed").length
  const totalTasks = tasks.length
  const isFinished = completedTasks === totalTasks
  const progress = isCloning ? (completedTasks / totalTasks) * 100 : 0
  const activeTask = tasks.find((t) => t.status === "in-progress")
  const colors = getStepColors(activeTask?.id)

  useEffect(() => {
    if (!open) {
      setIsCloning(false)
      setCurrentStep(0)
      setElapsedTime(0)
    }
  }, [open])

  useEffect(() => {
    if (!isCloning || isFinished) return
    const interval = setInterval(() => setElapsedTime((p) => p + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isFinished])

  useEffect(() => {
    if (!isCloning || currentStep > MOCK_TASKS.length) return
    const timer = setTimeout(() => setCurrentStep((s) => s + 1), 2000)
    return () => clearTimeout(timer)
  }, [isCloning, currentStep])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return {
    isCloning,
    isFinished,
    tasks,
    progress,
    colors,
    elapsedTime: formatTime(elapsedTime),
    completedTasks,
    totalTasks,
    startCloning: () => {
      setIsCloning(true)
      setCurrentStep(1)
    },
  }
}

export function ClonePodDialog({
  open,
  onOpenChange,
  pod,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pod: Pod | null
}) {
  const {
    isCloning,
    isFinished,
    tasks,
    progress,
    colors,
    elapsedTime,
    completedTasks,
    totalTasks,
    startCloning,
  } = useCloneSimulation(open)

  const [showDetails, setShowDetails] = useState(true)
  const stagger = useCutoutContentStaggerVariants()
  const podTitle = pod?.title ?? "Pod"

  return (
    <AlertDialog
      open={open}
      onOpenChange={(val) => {
        if (!isCloning || isFinished) {
          onOpenChange(val)
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AnimatePresence mode="wait">
                {isCloning ? (
                  isFinished ? (
                    <motion.span
                      key="finished-icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-emerald-500"
                    >
                      <IconCircleCheckFilled size={32} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="cloning-loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={cn(
                        "transition-colors duration-500",
                        colors.border,
                        colors.text
                      )}
                    >
                      <Loader
                        loader="pulse"
                        renderer="svg-grid"
                        speed={0.85}
                        rendererOptions={{
                          shape: "square",
                          cellSize: 6,
                          gap: 2,
                        }}
                      />
                    </motion.span>
                  )
                ) : (
                  <motion.span
                    key="approval-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-muted-foreground"
                  >
                    <IconCopy size={32} stroke={1.5} />
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-2xl font-semibold tracking-tight">
                {isFinished ? "Clone Complete" : "Clone Pod"}
              </span>
            </div>
            {isCloning && (
              <Badge
                variant="ghost"
                className="text-muted-foreground tabular-nums"
              >
                {isFinished ? "1 / 1 Completed" : "0 / 1 Completed"}
              </Badge>
            )}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <Progress
          value={progress}
          className="**:h-1.5"
          indicatorClassName={cn("transition-all duration-500", colors.bg)}
        />

        <ItemGroup className="gap-4">
          <Item
            key="test"
            variant="muted"
            role="listitem"
            className="shadow ring-1 ring-muted"
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
                        <IconCircleCheckFilled
                          size={24}
                          className="text-emerald-500"
                        />
                      ) : (
                        <IconBox size={24} stroke={1.5} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="line-clamp-1">
                  Clone &apos;{podTitle}&apos; Pod -{" "}
                  <span className="text-muted-foreground">mcaron</span>
                </ItemTitle>
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
                            <>Ready to clone</>
                          )}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </ItemDescription>
              </ItemContent>
              {isCloning && (
                <ItemContent className="flex-none self-start pt-0.5 text-center">
                  <ItemDescription>
                    <Badge variant="outline" className="font-mono">
                      <IconClock />
                      {elapsedTime}
                    </Badge>
                  </ItemDescription>
                </ItemContent>
              )}
              <ItemFooter className="justify-center">
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <IconChevronUp
                    className={cn("transition-transform duration-200", {
                      "rotate-180": !showDetails,
                    })}
                  />
                  {showDetails ? "Hide" : "Show"}
                </Button>
              </ItemFooter>
            </motion.div>
          </Item>
        </ItemGroup>

        <AlertDialogFooter>
          <AlertDialogCancel
            className="w-[50%]"
            disabled={isCloning && !isFinished}
            onClick={() => onOpenChange(false)}
          >
            {isFinished ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <Button
            variant="default"
            className={cn(
              "w-[50%] transition-colors duration-500",
              isCloning ? colors.bg : "bg-primary",
              "hover:opacity-90"
            )}
            disabled={isCloning}
            onClick={startCloning}
          >
            {isCloning ? (
              isFinished ? (
                "Completed"
              ) : (
                <>
                  <IconLoader2 className="mr-2 size-4 animate-spin" />
                  Cloning...
                </>
              )
            ) : (
              "Clone"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
