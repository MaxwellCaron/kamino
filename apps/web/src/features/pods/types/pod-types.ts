import type { VmResources } from "@/features/vms/types/vm-types"

export interface Pod {
  id: string
  title: string
  description: string
  image: string
  creators: Array<string>
  created_at: string
  clones: number
  isNew?: boolean
  vmsVisible?: boolean
}

export interface PodVM {
  id: string
  name: string
  status: string
  resources: VmResources
  uptime?: number
}

export type ClonedPodStatus = "running" | "stopped" | "partial"

export interface ClonedPod extends Pod {
  cloned_at: string
  status: ClonedPodStatus
  vms: Array<PodVM>
  tasks?: {
    total: number
    completed: number
    progress: number
    items: Array<PodTask>
  }
}

export interface PodTask {
  id: string
  title: string
  content: string
  completed: boolean
  questions?: Array<PodTaskQuestion>
}

export interface PodTaskQuestion {
  id: string
  title: string
  completed: boolean
  answerOutline?: string
  description?: string
  hint?: string
}
