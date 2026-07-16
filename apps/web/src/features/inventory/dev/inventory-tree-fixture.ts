import { InventoryPermissionBits } from "../utils/inventory-permissions"
import type {
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "../types/inventory-types"

const PODS_PER_TEAM = 5
const VMS_PER_POD = 40

const VIEW_ONLY_PERMISSIONS: ApiTreeNodePermissions = {
  allowed_mask: InventoryPermissionBits.view,
  denied_mask: 0,
  request_mask: 0,
}

export function createInventoryTreeFixture(
  vmCount: number
): Array<ApiTreeNode> {
  if (!Number.isSafeInteger(vmCount) || vmCount < 1) {
    throw new Error(
      "inventory fixture VM count must be a positive whole number"
    )
  }

  let idSequence = 0
  let vmIndex = 0
  let teamIndex = 0

  const nextId = () => {
    idSequence += 1
    return `f17e0000-0000-4000-8000-${idSequence.toString(16).padStart(12, "0")}`
  }

  const rootId = nextId()
  const teams: Array<ApiTreeNode> = []

  while (vmIndex < vmCount) {
    teamIndex += 1
    const teamStartIndex = vmIndex
    const pods: Array<ApiTreeNode> = []

    for (
      let podIndex = 1;
      podIndex <= PODS_PER_TEAM && vmIndex < vmCount;
      podIndex += 1
    ) {
      const podStartIndex = vmIndex
      const vms: Array<ApiTreeNode> = []

      for (
        let podVmIndex = 1;
        podVmIndex <= VMS_PER_POD && vmIndex < vmCount;
        podVmIndex += 1
      ) {
        vmIndex += 1
        const isTemplate = vmIndex % 25 === 0
        const guestType = vmIndex % 5 === 0 ? "lxc" : "qemu"
        const paddedVmIndex = vmIndex.toString().padStart(5, "0")

        vms.push({
          id: nextId(),
          name:
            vmIndex % 97 === 0
              ? `workload-${paddedVmIndex}-analysis-runner-with-a-long-operational-name`
              : `${isTemplate ? "template" : "workload"}-${paddedVmIndex}`,
          kind: "vm",
          permissions: VIEW_ONLY_PERMISSIONS,
          vm: {
            node: `fixture-node-${(vmIndex % 3) + 1}`,
            vmid: 100_000 + vmIndex,
            guest_type: guestType,
            is_template: isTemplate,
            notes: "Synthetic inventory fixture. No Proxmox resource exists.",
            cpu_count: guestType === "lxc" ? 2 : 4,
            memory_mb: guestType === "lxc" ? 2048 : 8192,
            disk_gb: guestType === "lxc" ? 16 : 64,
          },
        })
      }

      const podVmCount = vmIndex - podStartIndex
      const hasLimit = podIndex % 4 === 0
      const podNumber = podIndex.toString().padStart(2, "0")

      pods.push({
        id: nextId(),
        name: `Pod-${teamIndex.toString().padStart(3, "0")}-${podNumber}`,
        kind: "folder",
        description: "Synthetic pod used to exercise inventory tree rendering.",
        direct_vm_limit: hasLimit ? VMS_PER_POD + 10 : null,
        effective_vm_limit: hasLimit ? VMS_PER_POD + 10 : null,
        vm_count: podVmCount,
        permissions: VIEW_ONLY_PERMISSIONS,
        children: vms,
      })
    }

    const teamVmCount = vmIndex - teamStartIndex
    teams.push({
      id: nextId(),
      name: `Team-${teamIndex.toString().padStart(3, "0")}`,
      kind: "folder",
      description: "Synthetic team used to exercise nested tree expansion.",
      direct_vm_limit: null,
      effective_vm_limit: null,
      vm_count: teamVmCount,
      permissions: VIEW_ONLY_PERMISSIONS,
      children: pods,
    })
  }

  return [
    {
      id: rootId,
      name: "Infrastructure",
      kind: "folder",
      description:
        "Development-only synthetic inventory. No Proxmox resources exist.",
      direct_vm_limit: null,
      effective_vm_limit: null,
      vm_count: vmCount,
      permissions: VIEW_ONLY_PERMISSIONS,
      children: teams,
    },
  ]
}
