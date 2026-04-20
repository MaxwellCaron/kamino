import type { ApiTreeNode } from "@/lib/queries"
import { InventoryPermissionBits } from "@/lib/queries"

export type InventoryPermissionGroup = "general" | "folder" | "vm"

export type InventoryPermissionDefinition = {
  bit: number
  description: string
  group: InventoryPermissionGroup
  key: keyof typeof InventoryPermissionBits
  label: string
}

export const INVENTORY_PERMISSION_DEFINITIONS: Array<InventoryPermissionDefinition> =
  [
    {
      bit: InventoryPermissionBits.view,
      key: "view",
      label: "View",
      description:
        "Show inventory items covered by this rule in tree and details views.",
      group: "general",
    },
    {
      bit: InventoryPermissionBits.managePermissions,
      key: "managePermissions",
      label: "Manage Permissions",
      description: "Edit direct ACL overrides for items covered by this rule.",
      group: "general",
    },
    {
      bit: InventoryPermissionBits.createVm,
      key: "createVm",
      label: "Create VM",
      description: "Create new VMs inside this folder.",
      group: "folder",
    },
    {
      bit: InventoryPermissionBits.createFolder,
      key: "createFolder",
      label: "Create Folder",
      description: "Create child folders inside this folder.",
      group: "folder",
    },
    {
      bit: InventoryPermissionBits.renameFolder,
      key: "renameFolder",
      label: "Rename Folder",
      description: "Rename this folder.",
      group: "folder",
    },
    {
      bit: InventoryPermissionBits.deleteFolder,
      key: "deleteFolder",
      label: "Delete Folder",
      description: "Delete this folder and its subtree.",
      group: "folder",
    },
    {
      bit: InventoryPermissionBits.moveFolder,
      key: "moveFolder",
      label: "Move Folder",
      description: "Move this folder within the inventory tree.",
      group: "folder",
    },
    {
      bit: InventoryPermissionBits.editVmHardware,
      key: "editVmHardware",
      label: "Hardware",
      description:
        "Edit CPU, memory, disk, firmware, and network hardware for VMs covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.renameVm,
      key: "renameVm",
      label: "Rename VM",
      description: "Rename VMs or templates covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.deleteVm,
      key: "deleteVm",
      label: "Delete VM",
      description: "Delete VMs or templates covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.moveVm,
      key: "moveVm",
      label: "Move VM",
      description: "Move VMs covered by this rule between folders.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.powerVm,
      key: "powerVm",
      label: "Power VM",
      description:
        "Start, stop, reboot, and shut down VMs covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.consoleVm,
      key: "consoleVm",
      label: "Console VM",
      description: "Open the VNC console for VMs covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.cloneVm,
      key: "cloneVm",
      label: "Clone VM",
      description: "Clone VMs or templates covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.snapshotVm,
      key: "snapshotVm",
      label: "Snapshot VM",
      description:
        "Create, delete, and roll back snapshots for VMs covered by this rule.",
      group: "vm",
    },
    {
      bit: InventoryPermissionBits.templateVm,
      key: "templateVm",
      label: "Templatize VM",
      description: "Convert VMs covered by this rule into templates.",
      group: "vm",
    },
  ]

export const INVENTORY_PERMISSION_GROUP_LABELS: Record<
  InventoryPermissionGroup,
  string
> = {
  general: "General",
  folder: "Folder",
  vm: "VM",
}

const PERMISSION_GROUPS_BY_KIND: Record<
  ApiTreeNode["kind"],
  Array<InventoryPermissionGroup>
> = {
  folder: ["general", "folder", "vm"],
  vm: ["general", "vm"],
}

export function getInventoryPermissionDefinitions(kind: ApiTreeNode["kind"]) {
  const groups = new Set(PERMISSION_GROUPS_BY_KIND[kind])

  return INVENTORY_PERMISSION_DEFINITIONS.filter((permission) =>
    groups.has(permission.group)
  )
}

export function getInventoryPermissionDefinitionsByGroup(
  kind: ApiTreeNode["kind"]
) {
  const definitions = getInventoryPermissionDefinitions(kind)
  return PERMISSION_GROUPS_BY_KIND[kind].map((group) => ({
    group,
    label: INVENTORY_PERMISSION_GROUP_LABELS[group],
    permissions: definitions.filter((permission) => permission.group === group),
  }))
}

export function getInventoryPermissionLabels(
  kind: ApiTreeNode["kind"],
  mask: number
) {
  return getInventoryPermissionDefinitions(kind).filter(
    (permission) => (mask & permission.bit) === permission.bit
  )
}
