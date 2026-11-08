export type ProgressStepColors = {
  text: string
  border: string
  bg: string
  soft: string
}

export const DEFAULT_PROGRESS_COLORS: ProgressStepColors = {
  text: "text-primary dark:text-primary",
  border: "border-primary dark:border-primary",
  bg: "bg-primary dark:bg-primary",
  soft: "bg-primary/10 dark:bg-primary/10",
}

export const IDLE_PROGRESS_COLORS: ProgressStepColors = {
  text: "text-muted-foreground",
  border: "border-muted",
  bg: "bg-muted",
  soft: "bg-muted",
}

export const FAILED_PROGRESS_COLORS: ProgressStepColors = {
  text: "text-destructive!",
  border: "border-destructive!",
  bg: "bg-destructive!",
  soft: "bg-destructive/10!",
}

export const COMPLETE_PROGRESS_COLORS: ProgressStepColors = {
  text: "text-emerald-600 dark:text-emerald-400",
  border: "border-emerald-600 dark:border-emerald-400",
  bg: "bg-emerald-600 dark:bg-emerald-400",
  soft: "bg-emerald-600/10 dark:bg-emerald-400/10",
}

export function getProgressStepColors(stepId?: number): ProgressStepColors {
  switch (stepId) {
    case 1:
      return {
        text: "text-amber-600 dark:text-amber-400",
        border: "border-amber-600 dark:border-amber-400",
        bg: "bg-amber-600 dark:bg-amber-400",
        soft: "bg-amber-600/10 dark:bg-amber-400/10",
      }
    case 2:
      return {
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-600 dark:border-blue-400",
        bg: "bg-blue-600 dark:bg-blue-400",
        soft: "bg-blue-600/10 dark:bg-blue-400/10",
      }
    case 3:
      return {
        text: "text-violet-600 dark:text-violet-400",
        border: "border-violet-600 dark:border-violet-400",
        bg: "bg-violet-600 dark:bg-violet-400",
        soft: "bg-violet-600/10 dark:bg-violet-400/10",
      }
    case 4:
      return {
        text: "text-fuchsia-600 dark:text-fuchsia-400",
        border: "border-fuchsia-600 dark:border-fuchsia-400",
        bg: "bg-fuchsia-600 dark:bg-fuchsia-400",
        soft: "bg-fuchsia-600/10 dark:bg-fuchsia-400/10",
      }
    default:
      return COMPLETE_PROGRESS_COLORS
  }
}
