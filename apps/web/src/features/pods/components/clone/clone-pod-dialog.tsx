import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Progress } from "@workspace/ui/components/progress"
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react"
import { ItemGroup } from "@workspace/ui/components/item"
import { cn, uuid } from "@workspace/ui/lib/utils"
import { Loader } from "@dot-loaders/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CloneStatusItem } from "./clone-status-item"
import type {
  CloneStatusTask,
  CloneStepColors,
} from "@/features/pods/types/clone-status"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import {
  DEFAULT_CLONE_TASKS,
  getCloneStepColors,
} from "@/features/pods/types/clone-status"
import {
  clonePod,
  clonePodProgressQueryOptions,
} from "@/features/pods/api/clone-pod-api"

const FAILED_CLONE_COLORS: CloneStepColors = {
  text: "text-destructive!",
  border: "border-destructive!",
  bg: "bg-destructive!",
  soft: "bg-destructive/10!",
}

function useCloneProcess(open: boolean, pod: Pod | null) {
  const [progressId, setProgressId] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const cloneMutation = useMutation({
    mutationFn: clonePod,
  })
  const resetCloneMutation = cloneMutation.reset
  const progressQuery = useQuery(
    clonePodProgressQueryOptions(
      progressId,
      open && progressId != null && cloneMutation.isPending
    )
  )
  const progressState = progressQuery.data?.state
  const currentStep =
    progressQuery.data?.step_id ??
    (cloneMutation.isPending || cloneMutation.isSuccess || cloneMutation.isError
      ? 1
      : 0)
  const isError = cloneMutation.isError || progressState === "error"
  const isFinished = cloneMutation.isSuccess && !isError
  const isCloning =
    cloneMutation.isPending ||
    cloneMutation.isSuccess ||
    cloneMutation.isError ||
    progressState === "running" ||
    progressState === "success" ||
    progressState === "error"

  const tasks: Array<CloneStatusTask> = DEFAULT_CLONE_TASKS.map((task) => {
    if (!isCloning) return { ...task, status: "pending" }
    if (isFinished || currentStep > task.id) {
      return { ...task, status: "completed" }
    }
    if (currentStep === task.id) return { ...task, status: "in-progress" }
    return { ...task, status: "pending" }
  })

  const completedTasks = tasks.filter((t) => t.status === "completed").length
  const totalTasks = tasks.length
  const progress = isCloning ? (completedTasks / totalTasks) * 100 : 0
  const activeTask = tasks.find((t) => t.status === "in-progress")
  const colors = getCloneStepColors(activeTask?.id)

  useEffect(() => {
    if (!open) {
      setProgressId(null)
      setElapsedTime(0)
      resetCloneMutation()
    }
  }, [open, resetCloneMutation])

  useEffect(() => {
    if (!isCloning || isFinished || isError) return
    const interval = setInterval(() => setElapsedTime((p) => p + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isError, isFinished])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return {
    isCloning,
    isFinished,
    isError,
    tasks,
    progress,
    colors,
    elapsedTime: formatTime(elapsedTime),
    completedTasks,
    totalTasks,
    clonedPod: cloneMutation.data,
    errorMessage:
      progressQuery.data?.state === "error"
        ? progressQuery.data.message
        : cloneMutation.error?.message,
    startCloning: () => {
      if (!pod) return
      const nextProgressId = uuid()
      setElapsedTime(0)
      setProgressId(nextProgressId)
      cloneMutation.mutate({ podSlug: pod.slug, progressId: nextProgressId })
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
  onCloned?: (clone: ClonedPod) => void
}) {
  const {
    isCloning,
    isFinished,
    isError,
    tasks,
    progress,
    colors,
    elapsedTime,
    completedTasks,
    totalTasks,
    clonedPod,
    errorMessage,
    startCloning,
  } = useCloneProcess(open, pod)

  const podTitle = pod?.title ?? "Pod"
  const isBusy = isCloning && !isFinished && !isError
  const displayColors = isError ? FAILED_CLONE_COLORS : colors
  const handleOpenChange = (val: boolean) => {
    if (!val && (isBusy || isFinished)) {
      return
    }

    onOpenChange(val)
  }

  useEffect(() => {
    if (isFinished && clonedPod) {
      onCloned?.(clonedPod)
    }
  }, [clonedPod, isFinished, onCloned])

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AnimatePresence mode="wait">
                {isCloning ? (
                  isError ? (
                    <motion.span
                      key="failed-loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-destructive"
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
                  ) : isFinished ? (
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
                        displayColors.border,
                        displayColors.text
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
                {completedTasks} / {totalTasks} Completed
              </Badge>
            )}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <Progress
          value={progress}
          className="**:h-1.5"
          indicatorClassName={cn(
            "transition-all duration-500",
            displayColors.bg
          )}
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
            isFailed={isError}
            colors={displayColors}
            elapsedTime={elapsedTime}
          />
          {errorMessage && (
            <Alert variant="destructive" className="bg-muted/50">
              <IconAlertTriangle />
              <AlertTitle>Clone failed</AlertTitle>
              <AlertDescription>
                {errorMessage.charAt(0).toUpperCase() + errorMessage.slice(1)}
              </AlertDescription>
            </Alert>
          )}
        </ItemGroup>

        <AlertDialogFooter>
          <AlertDialogCancel
            className="w-[50%]"
            disabled={isBusy}
            onClick={(event) => {
              if (!isFinished) return
              event.preventDefault()
              onOpenChange(false)
            }}
          >
            {isFinished ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <Button
            variant="default"
            className={cn(
              "w-[50%] cursor-default transition-colors duration-500",
              isError
                ? "bg-destructive/20 text-muted-foreground"
                : isBusy
                  ? colors.bg
                  : "bg-primary disabled:bg-primary/50 disabled:text-muted-foreground"
            )}
            disabled={isBusy || isFinished || isError}
            onClick={
              isFinished
                ? () => {
                    if (clonedPod) onCloned?.(clonedPod)
                    onOpenChange(false)
                  }
                : startCloning
            }
          >
            {isBusy ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                Cloning...
              </>
            ) : isError ? (
              "Failed"
            ) : (
              "Clone"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
