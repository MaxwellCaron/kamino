import type { PublishPodFormValues } from "./publish-pod-form"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"
import type {
  ClonedPod,
  ClonedPodNetwork,
  PodVM,
} from "@/features/pods/types/pod-types"
import { createQuestionSummary } from "@/features/pods/utils/pod-runtime-state"

const PREVIEW_NETWORK_NUMBER = 1
const LAN_SUBNET = "192.168.1.0/24"
const LAN_GATEWAY = "192.168.1.1"
const DMZ_SUBNET = "10.0.50.0/24"
const DMZ_GATEWAY = "10.0.50.1"

function createPreviewWanNetwork(wanSubnet: string) {
  const [address] = wanSubnet.split("/")
  const octets = address.split(".")

  if (octets.length !== 4) {
    throw new Error(`Invalid pod clone target WAN subnet: ${wanSubnet}`)
  }

  const prefix = `${octets[0]}.${octets[1]}.${PREVIEW_NETWORK_NUMBER}`

  return {
    subnet: `${prefix}.0/24`,
    gateway: `${prefix}.1`,
  }
}

function createPreviewNetwork(
  folder: PublishPodFolder,
  target: PodCloneTarget
): ClonedPodNetwork {
  const wan = createPreviewWanNetwork(target.wan_subnet)
  const base = {
    number: PREVIEW_NETWORK_NUMBER,
    vnet: target.lan_vnet,
    external_subnet: wan.subnet,
    external_gateway: wan.gateway,
    internal_subnet: LAN_SUBNET,
    internal_gateway: LAN_GATEWAY,
    lan_vlan_tag: PREVIEW_NETWORK_NUMBER,
  }

  if (folder.network_profile_key === "lan-router-v1") {
    return {
      ...base,
      profile_key: "lan-router-v1",
      prefix_nat: {
        external: wan.subnet,
        internal: LAN_SUBNET,
      },
    }
  }

  if (folder.network_profile_key === "lan-dmz-router-v1") {
    return {
      ...base,
      profile_key: "lan-dmz-router-v1",
      dmz_vnet: target.dmz_vnet,
      dmz_subnet: DMZ_SUBNET,
      dmz_gateway: DMZ_GATEWAY,
      dmz_vlan_tag: PREVIEW_NETWORK_NUMBER,
      prefix_nat: {
        external: wan.subnet,
        internal: DMZ_SUBNET,
      },
    }
  }

  throw new Error(
    `Unsupported pod network profile: ${folder.network_profile_key}`
  )
}

function createPreviewVm(
  vm: PublishPodFormValues["virtual_machines"][number]
): PodVM {
  const memoryMb = vm.memoryGb * 1024
  const bytesPerGb = 1024 * 1024 * 1024

  return {
    id: vm.id,
    name: vm.name,
    status: "running",
    resources: {
      cpu: 0,
      maxcpu: vm.cpuCount,
      mem: 0,
      maxmem: vm.memoryGb * bytesPerGb,
      disk: 0,
      maxdisk: vm.storageGb * bytesPerGb,
      netin: 0,
      netout: 0,
      diskread: 0,
      diskwrite: 0,
      uptime: 0,
    },
    cpu_count: vm.cpuCount,
    memory_mb: memoryMb,
    disk_gb: vm.storageGb,
    host_octet: vm.host_octet ?? undefined,
    is_router: vm.is_router,
    segment_key: vm.segment_key,
    inventory: { itemId: vm.id },
  }
}

export function createPublishPodPreview(
  values: PublishPodFormValues,
  folder: PublishPodFolder,
  target: PodCloneTarget
): ClonedPod {
  return {
    id: values.id,
    pod_id: values.id,
    owner: {
      id: values.id,
      type: "user",
      label: "You",
      description: "Preview clone owner",
    },
    cloned_at: new Date().toISOString(),
    status: "running",
    network: createPreviewNetwork(folder, target),
    vms: values.virtual_machines.map(createPreviewVm),
    question_summary: createQuestionSummary(values.tasks, null),
    task_states: [],
    question_answers: [],
  }
}
