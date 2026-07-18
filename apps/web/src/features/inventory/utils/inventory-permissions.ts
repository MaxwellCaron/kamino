export const InventoryPermissionKeys = {
  consoleVm: "consoleVm",
  createFolder: "createFolder",
  createVm: "createVm",
  deleteFolder: "deleteFolder",
  deleteVm: "deleteVm",
  editVmHardware: "editVmHardware",
  cloneVm: "cloneVm",
  managePermissions: "managePermissions",
  moveFolder: "moveFolder",
  moveVm: "moveVm",
  powerVm: "powerVm",
  renameFolder: "renameFolder",
  renameVm: "renameVm",
  viewSnapshots: "viewSnapshots",
  snapshotVm: "snapshotVm",
  templateVm: "templateVm",
  view: "view",
} as const

export type InventoryPermissionKey =
  (typeof InventoryPermissionKeys)[keyof typeof InventoryPermissionKeys]

export type InventoryPermissionTargetKind = "folder" | "vm"

export type InventoryPermissionSectionKey = "general" | "folder" | "vm"

export type InventoryPermissionDefinition = {
  appliesToKinds: Array<InventoryPermissionTargetKind>
  bit: number
  description: string
  key: InventoryPermissionKey
  label: string
  order: number
  sectionKey: InventoryPermissionSectionKey
  sectionLabel: string
  sectionOrder: number
}

export type InventoryPermissionSection = {
  key: InventoryPermissionSectionKey
  label: string
  permissions: Array<InventoryPermissionDefinition>
}

export const InventoryPermissionBits: Record<InventoryPermissionKey, number> = {
  [InventoryPermissionKeys.view]: 1 << 0,
  [InventoryPermissionKeys.createVm]: 1 << 1,
  [InventoryPermissionKeys.createFolder]: 1 << 2,
  [InventoryPermissionKeys.renameVm]: 1 << 3,
  [InventoryPermissionKeys.renameFolder]: 1 << 4,
  [InventoryPermissionKeys.deleteVm]: 1 << 5,
  [InventoryPermissionKeys.deleteFolder]: 1 << 6,
  [InventoryPermissionKeys.moveVm]: 1 << 7,
  [InventoryPermissionKeys.moveFolder]: 1 << 8,
  [InventoryPermissionKeys.powerVm]: 1 << 9,
  [InventoryPermissionKeys.consoleVm]: 1 << 10,
  [InventoryPermissionKeys.cloneVm]: 1 << 11,
  [InventoryPermissionKeys.snapshotVm]: 1 << 12,
  [InventoryPermissionKeys.templateVm]: 1 << 13,
  [InventoryPermissionKeys.managePermissions]: 1 << 14,
  [InventoryPermissionKeys.editVmHardware]: 1 << 15,
  [InventoryPermissionKeys.viewSnapshots]: 1 << 16,
}

const inventoryPermissionDefinitions: Array<InventoryPermissionDefinition> = [
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.view,
    key: InventoryPermissionKeys.view,
    label: "View",
    description:
      "Show inventory items covered by this rule in tree and details views.",
    sectionKey: "general",
    sectionLabel: "General",
    sectionOrder: 0,
    order: 0,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.managePermissions,
    key: InventoryPermissionKeys.managePermissions,
    label: "Manage Permissions",
    description: "Edit direct ACL overrides for items covered by this rule.",
    sectionKey: "general",
    sectionLabel: "General",
    sectionOrder: 0,
    order: 1,
  },
  {
    appliesToKinds: ["folder"],
    bit: InventoryPermissionBits.createFolder,
    key: InventoryPermissionKeys.createFolder,
    label: "Create Folder",
    description: "Create child folders inside this folder.",
    sectionKey: "folder",
    sectionLabel: "Folder",
    sectionOrder: 1,
    order: 0,
  },
  {
    appliesToKinds: ["folder"],
    bit: InventoryPermissionBits.renameFolder,
    key: InventoryPermissionKeys.renameFolder,
    label: "Rename Folder",
    description: "Rename this folder.",
    sectionKey: "folder",
    sectionLabel: "Folder",
    sectionOrder: 1,
    order: 1,
  },
  {
    appliesToKinds: ["folder"],
    bit: InventoryPermissionBits.deleteFolder,
    key: InventoryPermissionKeys.deleteFolder,
    label: "Delete Folder",
    description: "Delete this folder and its subtree.",
    sectionKey: "folder",
    sectionLabel: "Folder",
    sectionOrder: 1,
    order: 2,
  },
  {
    appliesToKinds: ["folder"],
    bit: InventoryPermissionBits.moveFolder,
    key: InventoryPermissionKeys.moveFolder,
    label: "Move Folder",
    description: "Move this folder within the inventory tree.",
    sectionKey: "folder",
    sectionLabel: "Folder",
    sectionOrder: 1,
    order: 3,
  },
  {
    appliesToKinds: ["folder"],
    bit: InventoryPermissionBits.createVm,
    key: InventoryPermissionKeys.createVm,
    label: "Create VM",
    description: "Create new VMs inside this folder.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 0,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.editVmHardware,
    key: InventoryPermissionKeys.editVmHardware,
    label: "Hardware",
    description:
      "Edit CPU, memory, disk, firmware, and network hardware for VMs covered by this rule.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 1,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.renameVm,
    key: InventoryPermissionKeys.renameVm,
    label: "Rename VM",
    description: "Rename VMs or templates covered by this rule.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 2,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.deleteVm,
    key: InventoryPermissionKeys.deleteVm,
    label: "Delete VM",
    description:
      "Delete VMs or templates. This action always requires explicit Allow.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 3,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.moveVm,
    key: InventoryPermissionKeys.moveVm,
    label: "Move VM",
    description: "Move VMs covered by this rule between folders.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 4,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.powerVm,
    key: InventoryPermissionKeys.powerVm,
    label: "Power VM",
    description:
      "Start, stop, reboot, and shut down VMs. Allow runs immediately, Inherit requires approval, and Deny hides and blocks it.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 5,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.consoleVm,
    key: InventoryPermissionKeys.consoleVm,
    label: "Console VM",
    description: "Open the VNC console for VMs covered by this rule.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 6,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.cloneVm,
    key: InventoryPermissionKeys.cloneVm,
    label: "Clone VM",
    description: "Clone VMs or templates covered by this rule.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 7,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.viewSnapshots,
    key: InventoryPermissionKeys.viewSnapshots,
    label: "View Snapshots",
    description:
      "Browse existing VM snapshots and inspect rollback targets. This permission never requires approval by itself.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 8,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.snapshotVm,
    key: InventoryPermissionKeys.snapshotVm,
    label: "Snapshot VM",
    description: "Create or roll back snapshots.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 9,
  },
  {
    appliesToKinds: ["folder", "vm"],
    bit: InventoryPermissionBits.templateVm,
    key: InventoryPermissionKeys.templateVm,
    label: "Templatize VM",
    description: "Convert VMs covered by this rule into templates.",
    sectionKey: "vm",
    sectionLabel: "VM",
    sectionOrder: 2,
    order: 10,
  },
]

function getInventoryPermissionDefinitions(
  kind: InventoryPermissionTargetKind
) {
  return inventoryPermissionDefinitions.filter((permission) =>
    permission.appliesToKinds.includes(kind)
  )
}

export function getInventoryPermissionDefinitionsByGroup(
  kind: InventoryPermissionTargetKind
): Array<InventoryPermissionSection> {
  const sections = new Map<
    InventoryPermissionSectionKey,
    InventoryPermissionSection
  >()

  for (const permission of getInventoryPermissionDefinitions(kind)) {
    const section = sections.get(permission.sectionKey) ?? {
      key: permission.sectionKey,
      label: permission.sectionLabel,
      permissions: [],
    }
    section.permissions.push(permission)
    sections.set(permission.sectionKey, section)
  }

  return [...sections.values()].toSorted((left, right) => {
    const leftDefinition = left.permissions[0]
    const rightDefinition = right.permissions[0]
    return leftDefinition.sectionOrder - rightDefinition.sectionOrder
  })
}

export function hasInventoryPermission(
  permissions: { allowed_mask: number } | undefined,
  required: number
) {
  if (!permissions) return false
  return (permissions.allowed_mask & required) === required
}

export function canRequestInventoryPermission(
  permissions: { request_mask: number } | undefined,
  required: number
) {
  if (!permissions) return false
  return (permissions.request_mask & required) === required
}
