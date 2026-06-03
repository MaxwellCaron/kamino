export type CloneTaskStatus = "pending" | "in-progress" | "completed"

export type CloneStatusTask = {
  id: number
  name: string
  status: CloneTaskStatus
}

export type CloneStepColors = {
  text: string
  border: string
  bg: string
  soft: string
}

export const DEFAULT_CLONE_COLORS: CloneStepColors = {
  text: "text-primary dark:text-primary",
  border: "border-primary dark:border-primary",
  bg: "bg-primary dark:bg-primary",
  soft: "bg-primary/10 dark:bg-primary/10",
}

export const IDLE_CLONE_COLORS: CloneStepColors = {
  text: "text-muted-foreground",
  border: "border-muted",
  bg: "bg-muted",
  soft: "bg-muted",
}

export const FAILED_CLONE_COLORS: CloneStepColors = {
  text: "text-destructive!",
  border: "border-destructive!",
  bg: "bg-destructive!",
  soft: "bg-destructive/10!",
}

export const COMPLETE_CLONE_COLORS: CloneStepColors = {
  text: "text-green-600 dark:text-green-400",
  border: "border-green-600 dark:border-green-400",
  bg: "bg-green-600 dark:bg-green-400",
  soft: "bg-green-600/10 dark:bg-green-400/10",
}

export const DEFAULT_CLONE_TASKS = [
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
] as const

export const COMPLETE_CLONE_STEP_ID = DEFAULT_CLONE_TASKS.length

export function getCloneStepColors(taskId?: number): CloneStepColors {
  switch (taskId) {
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
      return COMPLETE_CLONE_COLORS
  }
}
