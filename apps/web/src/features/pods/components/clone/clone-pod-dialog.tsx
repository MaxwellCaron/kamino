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
import { IconLoader2 } from "@tabler/icons-react"
import { ItemGroup } from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import { Loader } from "@dot-loaders/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CloneStatusItem } from "./clone-status-item"
import type { CloneStatusTask } from "@/features/pods/types/clone-status"
import type { Pod } from "@/features/pods/types/pod-types"
import {
  DEFAULT_CLONE_TASKS,
  getCloneStepColors,
} from "@/features/pods/types/clone-status"

function useCloneSimulation(open: boolean) {
  const [isCloning, setIsCloning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)

  const tasks: Array<CloneStatusTask> = DEFAULT_CLONE_TASKS.map((task) => {
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
  const colors = getCloneStepColors(activeTask?.id)

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
    if (!isCloning || currentStep > DEFAULT_CLONE_TASKS.length) return
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
  username,
  onCloned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pod: Pod | null
  username: string
  onCloned?: () => void
}) {
  const {
    isCloning,
    isFinished,
    tasks,
    progress,
    colors,
    elapsedTime,
    startCloning,
  } = useCloneSimulation(open)

  const podTitle = pod?.title ?? "Pod"
  const handleOpenChange = (val: boolean) => {
    if (isCloning && !isFinished) {
      return
    }

    if (!val && isFinished) {
      onCloned?.()
    }

    onOpenChange(val)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AnimatePresence mode="wait">
                {isCloning ? (
                  isFinished ? (
                    <motion.span
                      key="finished-loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-primary"
                    >
                      <Loader
                        loader="pulse"
                        renderer="svg-grid"
                        speed={0.85}
                        rendererOptions={{
                          shape: "square",
                          cellSize: 6,
                          gap: 2,
                          inactiveOpacity: 1,
                        }}
                      />
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
                    key="approval-loader"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-muted-foreground"
                  >
                    <Loader
                      loader="pulse"
                      renderer="svg-grid"
                      speed={0.85}
                      rendererOptions={{
                        shape: "square",
                        cellSize: 6,
                        gap: 2,
                        inactiveOpacity: 1,
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-balancet scroll-m-20 text-4xl font-extrabold tracking-tight">
                Clone Pod
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
          <CloneStatusItem
            title={
              <>
                Clone &apos;{podTitle}&apos; Pod -{" "}
                <span className="text-muted-foreground">{username}</span>
              </>
            }
            tasks={tasks}
            isCloning={isCloning}
            isFinished={isFinished}
            colors={colors}
            elapsedTime={elapsedTime}
          />
        </ItemGroup>

        <AlertDialogFooter>
          <AlertDialogCancel
            className="w-[50%]"
            disabled={isCloning && !isFinished}
          >
            {isFinished ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <Button
            variant="default"
            className={cn(
              "w-[50%] cursor-default transition-colors duration-500",
              isCloning ? colors.bg : "bg-primary",
              "hover:opacity-90"
            )}
            disabled={isCloning || isFinished}
            onClick={
              isFinished
                ? () => {
                    onCloned?.()
                    onOpenChange(false)
                  }
                : startCloning
            }
          >
            {isCloning && !isFinished ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                Cloning...
              </>
            ) : (
              "Clone"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
