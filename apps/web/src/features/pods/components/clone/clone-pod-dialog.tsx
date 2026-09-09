import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CancelCircleIcon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  CopyIcon,
} from "@hugeicons/core-free-icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
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

type CloneProgressState = "running" | "success" | "error" | undefined

function getCloneProcessState({
  currentStep,
  mutationIsError,
  mutationIsPending,
  mutationIsSuccess,
  progressState,
}: {
  currentStep: number
  mutationIsError: boolean
  mutationIsPending: boolean
  mutationIsSuccess: boolean
  progressState: CloneProgressState
}) {
  const isError = mutationIsError || progressState === "error"
  const isFinished = mutationIsSuccess && !isError
  const isCloning =
    mutationIsPending ||
    mutationIsSuccess ||
    mutationIsError ||
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
  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length

  return {
    isCloning,
    isError,
    isFinished,
    tasks,
    progress: isCloning ? (completedTasks / tasks.length) * 100 : 0,
    colors: getProgressStepColors(
      tasks.find((task) => task.status === "in-progress")?.id
    ),
  }
}

function useCloneProcess({
  open,
  pod,
  clonedPodId,
  onCloned,
}: {
  open: boolean
  pod: Pod | null
  clonedPodId?: string
  onCloned?: (clone: ClonedPod) => void
}) {
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
  const { isCloning, isError, isFinished, tasks, progress, colors } =
    getCloneProcessState({
      currentStep,
      mutationIsError: cloneMutation.isError,
      mutationIsPending: cloneMutation.isPending,
      mutationIsSuccess: cloneMutation.isSuccess,
      progressState,
    })

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
    error:
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

function CloneDialogStatusIcon({
  colors,
  isCloning,
  isError,
  isFinished,
}: {
  colors: typeof FAILED_PROGRESS_COLORS
  isCloning: boolean
  isError: boolean
  isFinished: boolean
}) {
  if (!isCloning) {
    return (
      <m.span
        key="approval-loader"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={IDLE_PROGRESS_COLORS.text}
      >
        <HugeiconsIcon icon={CopyIcon} className="size-8" aria-hidden="true" />
      </m.span>
    )
  }

  if (isError) {
    return (
      <m.span
        key="failed-loader"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={FAILED_PROGRESS_COLORS.text}
      >
        <HugeiconsIcon
          icon={CancelCircleIcon}
          className="size-8"
          aria-hidden="true"
        />
      </m.span>
    )
  }

  if (isFinished) {
    return (
      <m.span
        key="finished-loader"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={COMPLETE_PROGRESS_COLORS.text}
      >
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          className="size-8"
          aria-hidden="true"
        />
      </m.span>
    )
  }

  return (
    <m.span
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
      <Spinner className="size-8" />
    </m.span>
  )
}

function getCloneDialogCopy(isReclone: boolean) {
  return isReclone
    ? {
        actionLabel: "Re-clone",
        dialogTitle: "Re-clone Pod",
        pendingLabel: "Re-cloning...",
      }
    : {
        actionLabel: "Clone",
        dialogTitle: "Clone Pod",
        pendingLabel: "Cloning...",
      }
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
    error,
    startCloning,
  } = useCloneProcess({ open, pod, clonedPodId, onCloned })

  const podTitle = pod?.title ?? "Pod"
  const isReclone = clonedPodId != null
  const { actionLabel, dialogTitle, pendingLabel } =
    getCloneDialogCopy(isReclone)
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
                <CloneDialogStatusIcon
                  colors={displayColors}
                  isCloning={isCloning}
                  isError={isError}
                  isFinished={isFinished}
                />
              </AnimatePresence>
              <span className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
                {dialogTitle}
              </span>
            </div>
            <Badge variant="outline" className="font-mono">
              <HugeiconsIcon icon={Clock01Icon} />
              {elapsedTime}
            </Badge>
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

        <div className="space-y-6">
          <CloneStatusItem
            title={
              <>
                {podTitle} -{" "}
                <span className="text-muted-foreground">{username}</span>
              </>
            }
            tasks={tasks}
            isFinished={isFinished}
            isFailed={isError}
            colors={displayColors}
          />
          {error && (
            <InlineErrorAlert
              error={error}
              fallback={`${actionLabel} failed.`}
              title={`${actionLabel} failed`}
              className="bg-muted/50"
            />
          )}
        </div>

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
