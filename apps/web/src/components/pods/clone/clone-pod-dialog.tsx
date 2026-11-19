import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { AnimatePresence, m } from "motion/react"
import {
  COMPLETE_PROGRESS_COLORS,
  FAILED_PROGRESS_COLORS,
  IDLE_PROGRESS_COLORS,
} from "@/lib/pods/progress-state/progress-state-colors"
import {
  CancelCircleIcon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  CopyIcon,
} from "@hugeicons/core-free-icons"
import type { ClonedPod, Pod } from "@/lib/pods/pod-types"
import { AppActionButton } from "@/components/app-action-button"
import { Badge } from "@workspace/ui/components/badge"
import { CloneStatusItem } from "@/components/pods/clone/clone-status-item"
import { HugeiconsIcon } from "@hugeicons/react"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { getCloneDialogCopy } from "@/lib/pods/clone-pod-dialog"
import { useCloneProcess } from "@/hooks/pods/use-clone-process"

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
