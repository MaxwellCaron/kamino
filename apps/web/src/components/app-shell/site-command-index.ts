import {
  IconCamera,
  IconCopy,
  IconCubePlus,
  IconCubeSend,
  IconDeviceDesktop,
  IconDeviceDesktopPlus,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconGauge,
  IconHome,
  IconLayoutDashboard,
  IconListDetails,
  IconLock,
  IconNetwork,
  IconPackage,
  IconPackages,
  IconReceipt,
  IconSettings,
  IconTemplate,
  IconTerminal2,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import {
  getFolderCapabilities,
  getVmCapabilities,
} from "@/features/inventory/utils/inventory-capabilities"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
} from "@/features/requests/utils/request-presenters"

export type CommandGroupKey =
  | "pages"
  | "inventory"
  | "actions"
  | "pods"
  | "principals"
  | "network"
  | "requests"

export type SiteCommandResult = {
  id: string
  group: CommandGroupKey
  icon: typeof IconHome
  label: string
  keywords: Array<string>
  onSelect: () => void
  shortcut?: string
  subtitle: string
}

type StaticCommandConfig = {
  group: CommandGroupKey
  icon: typeof IconHome
  id: string
  keywords: Array<string>
  label: string
  shortcut?: string
  subtitle: string
  to:
    | "/"
    | "/admin"
    | "/admin/principals/groups"
    | "/admin/principals/users"
    | "/admin/sdn"
    | "/manager/requests"
    | "/pods/browse"
    | "/pods/create"
    | "/pods/publish"
    | "/pods/published"
  visibility: "all" | "admin" | "manager"
}

export type BuildSiteCommandsActions = {
  close: () => void
  navigateHome: () => void
  navigateToInventoryItem: (itemId: string) => void
  navigateToPage: (to: StaticCommandConfig["to"]) => void
  navigateToPod: (podSlug: string) => void
  navigateToPublishedPod: (podId: string) => void
  navigateToRequests: () => void
  navigateToSdn: () => void
  navigateToUsers: () => void
  navigateToGroups: () => void
  openClone?: (config: {
    currentName: string
    currentVmid?: number
    isTemplate?: boolean
    itemId: string
  }) => void
  openCreateFolder?: (config: { parentId: string }) => void
  openCreateVm?: (config: { initialFolderId: string }) => void
  openEditVmHardware?: (config: {
    currentName: string
    currentVmid?: number
    itemId: string
  }) => void
  openFolderLimit?: (config: {
    directVmLimit?: number | null
    effectiveVmLimit?: number | null
    folderId: string
    folderName: string
    vmCount?: number | null
  }) => void
  openPermissions?: (config: {
    itemId: string
    itemKind: "folder" | "vm"
    itemName: string
    itemVmid?: number
  }) => void
  openRenameFolder?: (config: {
    currentName: string
    folderId: string
  }) => void
  openRenameVm?: (config: {
    currentName: string
    currentVmid?: number
    itemId: string
  }) => void
  openSnapshot?: (config: {
    currentName?: string
    currentVmid?: number
    itemId: string
    mode?: "direct" | "request"
  }) => void
}

export type BuildSiteCommandsParams = {
  actions: BuildSiteCommandsActions
  canAdminister: boolean
  canManage: boolean
  completedRequests?: Array<ApiRequestSummary>
  groups?: Array<ApiPrincipal>
  inventoryTree?: Array<ApiTreeNode>
  podCatalog?: Array<PublishedPodCatalogEntry>
  publishedPods?: Array<PublishedPodCatalogEntry>
  users?: Array<ApiPrincipal>
  vnets?: Array<ApiVNet>
  pendingRequests?: Array<ApiRequestSummary>
}

const staticCommands: Array<StaticCommandConfig> = [
  {
    id: "home",
    group: "pages",
    label: "Home",
    subtitle: "Dashboard overview",
    icon: IconHome,
    to: "/",
    shortcut: "⌘H",
    visibility: "all",
    keywords: ["dashboard", "overview", "activity"],
  },
  {
    id: "pods-browse",
    group: "pages",
    label: "Pods",
    subtitle: "Browse published pods",
    icon: IconPackages,
    to: "/pods/browse",
    visibility: "all",
    keywords: ["catalog", "launch", "clone"],
  },
  {
    id: "pods-create",
    group: "pages",
    label: "Create Pod",
    subtitle: "Build a pod from templates",
    icon: IconCubePlus,
    to: "/pods/create",
    visibility: "manager",
    keywords: ["manager", "new pod", "templates"],
  },
  {
    id: "pods-publish",
    group: "pages",
    label: "Publish Pod",
    subtitle: "Configure catalog access and tasks",
    icon: IconCubeSend,
    to: "/pods/publish",
    visibility: "manager",
    keywords: ["manager", "catalog", "tasks"],
  },
  {
    id: "pods-published",
    group: "pages",
    label: "Published Pods",
    subtitle: "Manage catalog entries",
    icon: IconListDetails,
    to: "/pods/published",
    visibility: "manager",
    keywords: ["manager", "catalog", "visibility"],
  },
  {
    id: "requests",
    group: "pages",
    label: "Requests",
    subtitle: "Review request queue",
    icon: IconReceipt,
    to: "/manager/requests",
    visibility: "manager",
    keywords: ["approval", "pending", "manager"],
  },
  {
    id: "admin",
    group: "pages",
    label: "Admin",
    subtitle: "Cluster and platform overview",
    icon: IconLayoutDashboard,
    to: "/admin",
    visibility: "admin",
    keywords: ["administrator", "metrics", "cluster"],
  },
  {
    id: "sdn",
    group: "pages",
    label: "SDN",
    subtitle: "Software-defined networking",
    icon: IconNetwork,
    to: "/admin/sdn",
    visibility: "admin",
    keywords: ["administrator", "network", "vnet"],
  },
  {
    id: "users",
    group: "pages",
    label: "Users",
    subtitle: "Manage user principals",
    icon: IconUser,
    to: "/admin/principals/users",
    visibility: "admin",
    keywords: ["administrator", "principals", "accounts"],
  },
  {
    id: "groups",
    group: "pages",
    label: "Groups",
    subtitle: "Manage group principals",
    icon: IconUsersGroup,
    to: "/admin/principals/groups",
    visibility: "admin",
    keywords: ["administrator", "principals", "roles"],
  },
]

export const groupLabels = {
  pages: "Pages",
  inventory: "Inventory",
  actions: "Actions",
  pods: "Pods",
  principals: "Principals",
  network: "Network",
  requests: "Requests",
} as const satisfies Record<CommandGroupKey, string>

export const groupOrder = [
  "pages",
  "principals",
  "inventory",
  "actions",
  "pods",
  "network",
  "requests",
] as const satisfies Array<CommandGroupKey>

function principalLabel(principal: ApiPrincipal) {
  return principal.name ?? principal.external_id
}

function collectTreeNodes(tree: Array<ApiTreeNode>) {
  const nodes: Array<ApiTreeNode> = []

  function walk(node: ApiTreeNode) {
    nodes.push(node)
    node.children?.forEach(walk)
  }

  tree.forEach(walk)
  return nodes
}

function formatInventoryPath(tree: Array<ApiTreeNode>, itemId: string) {
  const path = findTreePath(tree, itemId)
  if (!path) return "Inventory"
  if (path.length <= 1) return "Inventory"
  return path.map((item) => item.name).join(" / ")
}

function formatRequestLabel(request: ApiRequestSummary) {
  const itemName = request.inventory?.item_name
  if (itemName) {
    return `${formatRequestKind(request.kind)}: ${itemName}`
  }

  return formatRequestKind(request.kind)
}

function runCommand(actions: BuildSiteCommandsActions, action: () => void) {
  return () => {
    actions.close()
    action()
  }
}

function buildPageCommands({
  actions,
  canAdminister,
  canManage,
}: Pick<
  BuildSiteCommandsParams,
  "actions" | "canAdminister" | "canManage"
>) {
  const commands: Array<SiteCommandResult> = []

  for (const command of staticCommands) {
    if (command.visibility === "admin" && !canAdminister) continue
    if (command.visibility === "manager" && !canManage) continue

    commands.push({
      id: `page:${command.id}`,
      group: command.group,
      icon: command.icon,
      label: command.label,
      subtitle: command.subtitle,
      shortcut: command.shortcut,
      keywords: command.keywords,
      onSelect: runCommand(actions, () => actions.navigateToPage(command.to)),
    })
  }

  return commands
}

function buildInventoryCommands(
  tree: Array<ApiTreeNode>,
  actions: BuildSiteCommandsActions
) {
  const results: Array<SiteCommandResult> = []

  for (const node of collectTreeNodes(tree)) {
    const path = formatInventoryPath(tree, node.id)

    if (node.kind === "vm" && node.vm) {
      appendVmCommands(results, node, path, actions)
      continue
    }

    appendFolderCommands(results, node, path, actions)
  }

  return results
}

function appendVmCommands(
  results: Array<SiteCommandResult>,
  node: ApiTreeNode,
  path: string,
  actions: BuildSiteCommandsActions
) {
  if (!node.vm) return

  const vm = node.vm
  const isTemplate = vm.is_template
  const capabilities = getVmCapabilities(node.permissions, { isTemplate })
  const vmLabel = isTemplate ? "Template" : "VM"
  const vmKeywords = [
    path,
    vmLabel,
    String(vm.vmid),
    vm.node,
    isTemplate ? "template" : "virtual machine",
  ]
  const navigateToVm = () => actions.navigateToInventoryItem(node.id)

  results.push({
    id: `inventory:${node.id}`,
    group: "inventory",
    icon: isTemplate ? IconTemplate : IconDeviceDesktop,
    label: node.name,
    subtitle: `${vmLabel} ${vm.vmid} on ${vm.node}`,
    keywords: vmKeywords,
    onSelect: runCommand(actions, navigateToVm),
  })

  if (capabilities.console.visible) {
    results.push({
      id: `vm-action:${node.id}:console`,
      group: "actions",
      icon: IconTerminal2,
      label: `Open console for ${node.name}`,
      subtitle: `${vmLabel} ${vm.vmid}`,
      keywords: [...vmKeywords, "vnc", "console"],
      onSelect: runCommand(actions, navigateToVm),
    })
  }

  if (capabilities.clone.visible) {
    results.push({
      id: `vm-action:${node.id}:clone`,
      group: "actions",
      icon: IconCopy,
      label: `Clone ${node.name}`,
      subtitle: `${vmLabel} ${vm.vmid}`,
      keywords: [...vmKeywords, "clone", "copy"],
      onSelect: runCommand(actions, () => {
        actions.openClone?.({
          itemId: node.id,
          currentName: node.name,
          currentVmid: vm.vmid,
          isTemplate,
        }) ?? navigateToVm()
      }),
    })
  }

  if (capabilities.snapshot.visible) {
    results.push({
      id: `vm-action:${node.id}:snapshot`,
      group: "actions",
      icon: IconCamera,
      label: `Snapshot ${node.name}`,
      subtitle:
        capabilities.snapshot.mode === "request"
          ? "Submit a snapshot request"
          : `VM ${vm.vmid}`,
      keywords: [...vmKeywords, "snapshot", "rollback"],
      onSelect: runCommand(actions, () => {
        actions.openSnapshot?.({
          itemId: node.id,
          currentName: node.name,
          currentVmid: vm.vmid,
          mode: capabilities.snapshot.mode ?? "direct",
        }) ?? navigateToVm()
      }),
    })
  }

  if (capabilities.editHardware.visible) {
    results.push({
      id: `vm-action:${node.id}:hardware`,
      group: "actions",
      icon: IconSettings,
      label: `Edit hardware for ${node.name}`,
      subtitle: `VM ${vm.vmid}`,
      keywords: [...vmKeywords, "hardware", "cpu", "memory", "disk"],
      onSelect: runCommand(actions, () => {
        actions.openEditVmHardware?.({
          itemId: node.id,
          currentName: node.name,
          currentVmid: vm.vmid,
        }) ?? navigateToVm()
      }),
    })
  }

  if (capabilities.rename.visible) {
    results.push({
      id: `vm-action:${node.id}:rename`,
      group: "actions",
      icon: IconEdit,
      label: `Rename ${node.name}`,
      subtitle: `${vmLabel} ${vm.vmid}`,
      keywords: [...vmKeywords, "rename", "edit"],
      onSelect: runCommand(actions, () => {
        actions.openRenameVm?.({
          itemId: node.id,
          currentName: node.name,
          currentVmid: vm.vmid,
        }) ?? navigateToVm()
      }),
    })
  }

  if (capabilities.managePermissions.visible) {
    results.push({
      id: `vm-action:${node.id}:permissions`,
      group: "actions",
      icon: IconLock,
      label: `Edit permissions for ${node.name}`,
      subtitle: `${vmLabel} ${vm.vmid}`,
      keywords: [...vmKeywords, "acl", "permissions", "access"],
      onSelect: runCommand(actions, () => {
        actions.openPermissions?.({
          itemId: node.id,
          itemKind: node.kind,
          itemName: node.name,
          itemVmid: vm.vmid,
        }) ?? navigateToVm()
      }),
    })
  }
}

function appendFolderCommands(
  results: Array<SiteCommandResult>,
  node: ApiTreeNode,
  path: string,
  actions: BuildSiteCommandsActions
) {
  const capabilities = getFolderCapabilities(node.permissions)
  const folderKeywords = [path, "folder", "inventory"]
  const navigateHome = () => actions.navigateHome()

  results.push({
    id: `inventory:${node.id}`,
    group: "inventory",
    icon: IconFolder,
    label: node.name,
    subtitle: path,
    keywords: folderKeywords,
    onSelect: runCommand(actions, navigateHome),
  })

  if (capabilities.createVm.visible) {
    results.push({
      id: `inventory-action:${node.id}:create-vm`,
      group: "actions",
      icon: IconDeviceDesktopPlus,
      label: `Create VM in ${node.name}`,
      subtitle: path,
      keywords: [...folderKeywords, "new vm", "create virtual machine"],
      onSelect: runCommand(actions, () => {
        actions.openCreateVm?.({ initialFolderId: node.id }) ?? navigateHome()
      }),
    })
  }

  if (capabilities.createFolder.visible) {
    results.push({
      id: `inventory-action:${node.id}:create-folder`,
      group: "actions",
      icon: IconFolderPlus,
      label: `Create folder in ${node.name}`,
      subtitle: path,
      keywords: [...folderKeywords, "new folder"],
      onSelect: runCommand(actions, () => {
        actions.openCreateFolder?.({ parentId: node.id }) ?? navigateHome()
      }),
    })
  }

  if (capabilities.rename.visible) {
    results.push({
      id: `inventory-action:${node.id}:rename-folder`,
      group: "actions",
      icon: IconEdit,
      label: `Rename folder ${node.name}`,
      subtitle: path,
      keywords: [...folderKeywords, "rename", "edit"],
      onSelect: runCommand(actions, () => {
        actions.openRenameFolder?.({
          folderId: node.id,
          currentName: node.name,
        }) ?? navigateHome()
      }),
    })
  }

  if (capabilities.managePermissions.visible) {
    results.push({
      id: `inventory-action:${node.id}:folder-limit`,
      group: "actions",
      icon: IconGauge,
      label: `Set VM limit for ${node.name}`,
      subtitle: path,
      keywords: [...folderKeywords, "limit", "quota"],
      onSelect: runCommand(actions, () => {
        actions.openFolderLimit?.({
          directVmLimit: node.direct_vm_limit,
          effectiveVmLimit: node.effective_vm_limit,
          folderId: node.id,
          folderName: node.name,
          vmCount: node.vm_count,
        }) ?? navigateHome()
      }),
    })

    results.push({
      id: `inventory-action:${node.id}:permissions`,
      group: "actions",
      icon: IconLock,
      label: `Edit permissions for ${node.name}`,
      subtitle: path,
      keywords: [...folderKeywords, "acl", "permissions", "access"],
      onSelect: runCommand(actions, () => {
        actions.openPermissions?.({
          itemId: node.id,
          itemKind: node.kind,
          itemName: node.name,
        }) ?? navigateHome()
      }),
    })
  }
}

function buildPodCommands({
  actions,
  canManage,
  podCatalog,
  publishedPods,
}: Pick<
  BuildSiteCommandsParams,
  "actions" | "canManage" | "podCatalog" | "publishedPods"
>) {
  const results: Array<SiteCommandResult> = []

  for (const pod of podCatalog ?? []) {
    results.push({
      id: `pod:${pod.id}`,
      group: "pods",
      icon: IconPackage,
      label: pod.title,
      subtitle: "Published pod catalog",
      keywords: [
        pod.slug,
        pod.description,
        pod.source_folder,
        ...pod.creators.map((creator) => creator.label),
      ],
      onSelect: runCommand(actions, () => actions.navigateToPod(pod.slug)),
    })
  }

  if (canManage) {
    for (const pod of publishedPods ?? []) {
      results.push({
        id: `published-pod:${pod.id}`,
        group: "pods",
        icon: IconListDetails,
        label: `Edit ${pod.title}`,
        subtitle: `Published pod · ${pod.status}`,
        keywords: [pod.slug, pod.description, pod.source_folder, "manager"],
        onSelect: runCommand(actions, () =>
          actions.navigateToPublishedPod(pod.id)
        ),
      })
    }
  }

  return results
}

function buildAdminCommands({
  actions,
  canAdminister,
  groups,
  users,
  vnets,
}: Pick<
  BuildSiteCommandsParams,
  "actions" | "canAdminister" | "groups" | "users" | "vnets"
>) {
  const results: Array<SiteCommandResult> = []
  if (!canAdminister) return results

  ;(users ?? []).forEach((principal) => {
    const label = principalLabel(principal)
    results.push({
      id: `user:${principal.id}`,
      group: "principals",
      icon: IconUser,
      label,
      subtitle: principal.description ?? "User principal",
      keywords: [principal.external_id, principal.description ?? "", "user"],
      onSelect: runCommand(actions, actions.navigateToUsers),
    })
  })

  ;(groups ?? []).forEach((principal) => {
    const label = principalLabel(principal)
    results.push({
      id: `group:${principal.id}`,
      group: "principals",
      icon: IconUsersGroup,
      label,
      subtitle: principal.description ?? "Group principal",
      keywords: [
        principal.external_id,
        principal.description ?? "",
        "group",
        "role",
      ],
      onSelect: runCommand(actions, actions.navigateToGroups),
    })
  })

  ;(vnets ?? []).forEach((vnet) => {
    results.push({
      id: `vnet:${vnet.vnet}`,
      group: "network",
      icon: IconNetwork,
      label: vnet.vnet,
      subtitle: `${vnet.zone}${vnet.tag ? ` · VLAN ${vnet.tag}` : ""}`,
      keywords: [vnet.alias ?? "", vnet.zone, String(vnet.tag ?? ""), "sdn"],
      onSelect: runCommand(actions, actions.navigateToSdn),
    })
  })

  return results
}

function buildRequestCommands({
  actions,
  canManage,
  completedRequests,
  pendingRequests,
}: Pick<
  BuildSiteCommandsParams,
  "actions" | "canManage" | "completedRequests" | "pendingRequests"
>) {
  if (!canManage) return []

  const requests = [...(pendingRequests ?? []), ...(completedRequests ?? [])]

  return requests.map((request): SiteCommandResult => {
    const powerAction = formatRequestPowerAction(
      request.inventory?.power_action
    )

    return {
      id: `request:${request.id}`,
      group: "requests",
      icon: IconReceipt,
      label: formatRequestLabel(request),
      subtitle: `${formatRequestStatus(request.status)} · ${request.requester_username}`,
      keywords: [
        request.id,
        request.kind,
        request.family,
        request.requester_username,
        powerAction ?? "",
        request.inventory?.item_name ?? "",
        request.inventory?.snapshot_name ?? "",
      ],
      onSelect: runCommand(actions, actions.navigateToRequests),
    }
  })
}

export function buildSiteCommands(params: BuildSiteCommandsParams) {
  return [
    ...buildPageCommands(params),
    ...buildInventoryCommands(params.inventoryTree ?? [], params.actions),
    ...buildPodCommands(params),
    ...buildAdminCommands(params),
    ...buildRequestCommands(params),
  ]
}
