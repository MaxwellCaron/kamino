import type { VmResources } from "@/features/vms/types/vm-types"

// Backend/database UUID string.
export type UUID = string

export type PodStatus = "listed" | "unlisted"

export type PodAudiencePrincipal = {
  id: string
  type: "group" | "user"
  label: string
  description: string
}

export type PodAudience = Array<PodAudiencePrincipal>
export type PodCreator = PodAudiencePrincipal

// Cloneable catalog/template metadata.
export interface Pod {
  id: UUID
  title: string
  slug: string
  description: string
  image: string
  creators: Array<PodCreator>
  created_at: string
  clone_count: number
  status: PodStatus
  audience: PodAudience
  tasks?: Array<PodTask>
}

export interface PublishedPodVirtualMachine {
  id: UUID
  name: string
  cpuCount: number
  memoryGb: number
  storageGb: number
  permissions: {
    allowMask: number
    denyMask: number
  }
}

export interface PublishedPodCatalogEntry extends Pod {
  source_folder: string
  virtual_machines: Array<PublishedPodVirtualMachine>
}

export interface PodVM {
  id: UUID
  name: string
  status: string
  resources: VmResources
  uptime?: number
  inventory: {
    itemId: string
  }
}

export type ClonedPodStatus = "running" | "stopped" | "partial"

export interface ClonedPodNetwork {
  number: number
  vnet: string
  external_subnet: string
  internal_subnet: string
}

// User-owned runtime instance of a pod.
export interface ClonedPod {
  id: UUID
  pod_id: UUID
  owner: PublishedPodCloneOwner
  cloned_at: string
  status: ClonedPodStatus
  network: ClonedPodNetwork
  vms: Array<PodVM>
  task_summary: ClonedPodTaskSummary
  task_states: Array<ClonedPodTaskState>
  question_answers: Array<PodTaskQuestionAnswer>
}

export interface ClonedPodTaskSummary {
  total: number
  completed: number
  progress: number
}

export interface ClonedPodTaskState {
  task_id: UUID
  completed: boolean
  completed_at?: string
}

export interface PodTask {
  id: UUID
  title: string
  content: string
  questions?: Array<PodTaskQuestion>
}

export interface PodTaskQuestion {
  id: UUID
  title: string
  answerOutline?: string
  description?: string
  hint?: string
}

export interface PodTaskQuestionAnswer {
  question_id: UUID
  answer: string
  is_correct: boolean
  answered_at: string
}

export interface PodQuestionActivityAnswer {
  pod_id: UUID
  question_id: UUID
  answered_at: string
}

export interface PublishedPodCloneOwner {
  id: UUID
  type: "group" | "user"
  label: string
  description: string
}

export interface PublishedPodCloneSummary {
  id: UUID
  pod_id: UUID
  owner: PublishedPodCloneOwner
  cloned_at: string
  updated_at: string
  status: ClonedPodStatus
  network: ClonedPodNetwork
  vm_count: number
  task_summary: ClonedPodTaskSummary
}
