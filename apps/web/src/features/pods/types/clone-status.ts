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
