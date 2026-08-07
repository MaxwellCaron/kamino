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
  is_router?: boolean
  segment_key?: string | null
  host_octet?: number | null
  permissions: {
    allowMask: number
    denyMask: number
  }
}

export interface PublishedPodCatalogEntry extends Pod {
  source_folder: string
  clone_target_key: string
  virtual_machines: Array<PublishedPodVirtualMachine>
}

export interface PodVM {
  id: UUID
  name: string
  status: string
  resources: VmResources
  uptime?: number
  cpu_count?: number
  memory_mb?: number
  disk_gb?: number
  host_octet?: number
  is_router?: boolean
  segment_key?: string | null
  inventory: {
    itemId: string
  }
}

export type ClonedPodStatus = "running" | "stopped" | "partial"

export type PodPowerResult = {
  action: "start" | "shutdown"
  status: "succeeded" | "partial" | "failed"
}

export interface ClonedPodNetworkPrefixNAT {
  external: string
  internal: string
}

interface ClonedPodNetworkBase {
  number: number
  vnet: string
  external_subnet: string
  external_gateway?: string
  internal_subnet: string
  internal_gateway?: string
  lan_vlan_tag?: number
  prefix_nat?: ClonedPodNetworkPrefixNAT
}

export type ClonedPodNetwork =
  | (ClonedPodNetworkBase & { profile_key: "lan-router-v1" })
  | (ClonedPodNetworkBase & {
      profile_key: "lan-dmz-router-v1"
      dmz_vnet: string
      dmz_subnet: string
      dmz_gateway?: string
      dmz_vlan_tag?: number
    })

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
  power_result?: PodPowerResult
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
  power_result?: PodPowerResult
}
