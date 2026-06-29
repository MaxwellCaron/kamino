import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, m } from "motion/react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Progress } from "@workspace/ui/components/progress"
import { ItemGroup } from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import { Loader } from "@dot-loaders/react"
import { Badge } from "@workspace/ui/components/badge"
import { CloneStatusItem } from "./clone-status-item"
import type { CloneStatusTask } from "@/features/pods/types/clone-status"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import { AppActionButton } from "@/components/actions/app-action-button"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { uuid } from "@/features/shared/utils/uuid"
import {
  COMPLETE_PROGRESS_COLORS,
  FAILED_PROGRESS_COLORS,
  IDLE_PROGRESS_COLORS,
  getProgressStepColors,
} from "@/components/progress-state/progress-state-colors"
import { DEFAULT_CLONE_TASKS } from "@/features/pods/types/clone-status"
import {
  clonePod,
  clonePodProgressQueryOptions,
  clonedPodQueryOptions,
  reclonePod,
} from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"

function useCloneProcess(
  open: boolean,
  pod: Pod | null,
  clonedPodId?: string,
  onCloned?: (clone: ClonedPod) => void
) {
  const queryClient = useQueryClient()
  const [progressId, setProgressId] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const cloneMutation = useMutation({
    mutationFn: (params: { podSlug: string; progressId: string }) => {
      if (clonedPodId) {
        return reclonePod({ clonedPodId, progressId: params.progressId })
      }

      return clonePod(params)
    },
    onSuccess: async (clone) => {
      onCloned?.(clone)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: clonedPodQueryOptions(pod?.slug).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        }),
      ])
    },
  })
  const { data: progressData } = useQuery(
    clonePodProgressQueryOptions(
      progressId,
      open && progressId != null && cloneMutation.isPending
    )
  )
  const progressState = progressData?.state
  const currentStep =
    progressData?.step_id ??
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
  const colors = getProgressStepColors(activeTask?.id)

  useEffect(() => {
    if (!isCloning || isFinished || isError) return
    const interval = setInterval(() => setElapsedTime((p) => p + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isError, isFinished])

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
    errorMessage:
      progressData?.state === "error"
        ? progressData.message
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

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function ClonePodDialog({
  open,
  onOpenChange,
  pod,
  username,
  clonedPodId,
  onCloned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pod: Pod | null
  username: string
  clonedPodId?: string
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
    errorMessage,
    startCloning,
  } = useCloneProcess(open, pod, clonedPodId, onCloned)

  const podTitle = pod?.title ?? "Pod"
  const isReclone = clonedPodId != null
  const dialogTitle = isReclone ? "Re-clone Pod" : "Clone Pod"
  const actionLabel = isReclone ? "Re-clone" : "Clone"
  const pendingLabel = isReclone ? "Re-cloning..." : "Cloning..."
  const isBusy = isCloning && !isFinished && !isError
  const displayColors = isError ? FAILED_PROGRESS_COLORS : colors
  const handleOpenChange = (val: boolean) => {
    if (!val && (isBusy || isFinished)) {
      return
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
                  isError ? (
                    <m.span
                      key="failed-loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={FAILED_PROGRESS_COLORS.text}
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
                    </m.span>
                  ) : isFinished ? (
                    <m.span
                      key="finished-loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={COMPLETE_PROGRESS_COLORS.text}
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
                    </m.span>
                  ) : (
                    <m.span
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
                    </m.span>
                  )
                ) : (
                  <m.span
                    key="approval-loader"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={IDLE_PROGRESS_COLORS.text}
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
                  </m.span>
                )}
              </AnimatePresence>
              <span className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
                {dialogTitle}
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
                {actionLabel} &apos;{podTitle}&apos; Pod -{" "}
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
            <InlineErrorAlert
              error={errorMessage}
              fallback={`${actionLabel} failed.`}
              title={`${actionLabel} failed`}
              className="bg-muted/50"
            />
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
          <AppActionButton
            type="button"
            variant={isError ? "destructive" : isBusy ? "default" : undefined}
            className={cn(
              "w-[50%] cursor-pointer transition-colors duration-500",
              isBusy ? colors.bg : undefined
            )}
            disabled={isFinished || isError}
            pending={isBusy}
            pendingLabel={pendingLabel}
            onClick={startCloning}
          >
            {isError ? "Failed" : actionLabel}
          </AppActionButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
