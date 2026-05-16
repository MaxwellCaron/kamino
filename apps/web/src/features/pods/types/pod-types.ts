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

export interface ClonedPod extends Pod {
  cloned_at: string
  vms: Array<PodVM>
  tasks?: {
    total: number
    completed: number
    progress: number
    items: Array<PodTaskItem>
  }
}

export interface PodTaskItem {
  id: string
  title: string
  description?: string
  completed: boolean
  hint?: string
}
