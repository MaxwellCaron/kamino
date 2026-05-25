import type { VmResources } from "@/features/vms/types/vm-types"
import type { ApiTreeNodePermissions } from "@/features/inventory/types/inventory-types"

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
  vms_visible: boolean
  tasks?: Array<PodTask>
}

export interface PodVM {
  id: UUID
  name: string
  status: string
  resources: VmResources
  uptime?: number
  inventory: {
    itemId: string
    nodeId: string
    permissions: ApiTreeNodePermissions
    vmid: number
    pveNode: string
    isTemplate?: boolean
  }
}

export type ClonedPodStatus = "running" | "stopped" | "partial"

// User-owned runtime instance of a pod.
export interface ClonedPod {
  id: UUID
  pod_id: UUID
  cloned_at: string
  status: ClonedPodStatus
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
