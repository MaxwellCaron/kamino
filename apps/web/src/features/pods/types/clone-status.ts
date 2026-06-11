export type CloneTaskStatus = "pending" | "in-progress" | "completed"

export type CloneStatusTask = {
  id: number
  name: string
  status: CloneTaskStatus
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
