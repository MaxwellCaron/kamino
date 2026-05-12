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
}

export interface ClonedPod extends Pod {
  cloned_at: string
  vms: Array<{
    id: string
    name: string
    status: string
    resources: VmResources
  }>
}
