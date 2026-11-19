import type { CloneStatusTask } from "@/lib/pods/clone-status"
import { DEFAULT_CLONE_TASKS } from "@/lib/pods/clone-status"
import { getProgressStepColors } from "@/lib/pods/progress-state/progress-state-colors"

export type CloneProgressState = "running" | "success" | "error" | undefined

export function getCloneProcessState({
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

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function getCloneDialogCopy(isReclone: boolean) {
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
