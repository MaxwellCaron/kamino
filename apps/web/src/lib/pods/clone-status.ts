export type CloneTaskStatus = "pending" | "in-progress" | "completed"

export type CloneStatusTask = {
  id: number
  name: string
  status: CloneTaskStatus
}

export const DEFAULT_CLONE_TASKS = [
  {
    id: 1,
    name: "Fetch pod virtual machines",
  },
  {
    id: 2,
    name: "Clone virtual machines",
  },
  {
    id: 3,
    name: "Prepare virtual machines",
  },
  { id: 4, name: "Start router" },
] as const
