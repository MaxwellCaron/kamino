import {
  ComputerIcon,
  Copy02Icon,
  DashboardSquare01Icon,
  FolderIcon,
  GitPullRequestIcon,
  Globe02Icon,
  Home03Icon,
  Logout01Icon,
  Moon02Icon,
  NotebookIcon,
  PackageAddIcon,
  PackageCheck,
  PackageIcon,
  PackageMovingIcon,
  ReloadIcon,
  Shield01Icon,
  SparklesIcon,
  Sun01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import { searchDocs } from "@/features/documentation/utils/docs-search"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
} from "@/features/requests/utils/request-presenters"

export type CommandGroupKey =
  | "account"
  | "pages"
  | "docs"
  | "inventory"
  | "pods"
  | "principals"
  | "network"
  | "requests"

export type CommandTheme = "light" | "dark" | "system"

export type SiteCommandResult = {
  id: string
  group: CommandGroupKey
  icon: IconSvgElement
  label: string
  keywords: Array<string>
  onSelect: () => void
  preview?: string
  shortcut?: string
  subtitle: string
  variant?: "default" | "destructive"
}

type StaticCommandConfig = {
  group: CommandGroupKey
  icon: IconSvgElement
  id: string
  keywords: Array<string>
  label: string
  shortcut?: string
  subtitle: string
  to:
    | "/"
    | "/admin"
    | "/admin/audit"
    | "/admin/docs"
    | "/admin/proxmox-sync"
    | "/admin/principals/groups"
    | "/admin/principals/users"
    | "/admin/sdn"
    | "/changelog"
    | "/docs"
    | "/manager/docs"
    | "/manager/requests"
    | "/pods"
    | "/pods/create"
    | "/pods/publish"
    | "/pods/published"
  visibility: "all" | "admin" | "manager"
}

export type BuildSiteCommandsActions = {
  close: () => void
  logout: () => void
  navigateToDocsSection: (
    to: "/docs" | "/manager/docs" | "/admin/docs",
    hash: string
  ) => void
  navigateToInventoryItem: (itemId: string) => void
  navigateToPage: (to: StaticCommandConfig["to"]) => void
  navigateToPod: (podSlug: string) => void
  navigateToPublishedPod: (podId: string) => void
  navigateToRequests: () => void
  navigateToSdn: () => void
  navigateToUsers: () => void
  navigateToGroups: () => void
  setTheme: (theme: CommandTheme) => void
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
    icon: Home03Icon,
    to: "/",
    visibility: "all",
    keywords: ["dashboard", "overview", "activity"],
  },
  {
    id: "pods-browse",
    group: "pages",
    label: "Pods",
    subtitle: "Browse published pods",
    icon: PackageIcon,
    to: "/pods",
    visibility: "all",
    keywords: ["catalog", "launch", "clone"],
  },
  {
    id: "changelog",
    group: "pages",
    label: "Changelog",
    subtitle: "Latest updates and releases",
    icon: SparklesIcon,
    to: "/changelog",
    visibility: "all",
    keywords: ["changelog", "updates", "releases", "new", "what's new"],
  },
  {
    id: "docs-user",
    group: "pages",
    label: "User Guide",
    subtitle: "Learn how to clone and operate pods",
    icon: NotebookIcon,
    to: "/docs",
    visibility: "all",
    keywords: ["guide", "docs", "help", "pods"],
  },
  {
    id: "pods-create",
    group: "pages",
    label: "Create Pod",
    subtitle: "Build a pod from templates",
    icon: PackageAddIcon,
    to: "/pods/create",
    visibility: "manager",
    keywords: ["manager", "new pod", "templates"],
  },
  {
    id: "pods-publish",
    group: "pages",
    label: "Publish Pod",
    subtitle: "Configure catalog access and tasks",
    icon: PackageCheck,
    to: "/pods/publish",
    visibility: "manager",
    keywords: ["manager", "catalog", "tasks"],
  },
  {
    id: "pods-published",
    group: "pages",
    label: "Published Pods",
    subtitle: "Manage catalog entries",
    icon: PackageMovingIcon,
    to: "/pods/published",
    visibility: "manager",
    keywords: ["manager", "catalog", "visibility"],
  },
  {
    id: "requests",
    group: "pages",
    label: "Requests",
    subtitle: "Review request queue",
    icon: GitPullRequestIcon,
    to: "/manager/requests",
    visibility: "manager",
    keywords: ["approval", "pending", "manager"],
  },
  {
    id: "docs-manager",
    group: "pages",
    label: "Manager Guide",
    subtitle: "Learn how to publish pods and review requests",
    icon: NotebookIcon,
    to: "/manager/docs",
    visibility: "manager",
    keywords: ["guide", "docs", "help", "pods", "requests"],
  },
  {
    id: "admin",
    group: "pages",
    label: "Admin",
    subtitle: "Cluster and platform overview",
    icon: DashboardSquare01Icon,
    to: "/admin",
    visibility: "admin",
    keywords: ["administrator", "metrics", "cluster"],
  },
  {
    id: "sdn",
    group: "pages",
    label: "SDN",
    subtitle: "Software-defined networking",
    icon: Globe02Icon,
    to: "/admin/sdn",
    visibility: "admin",
    keywords: ["administrator", "network", "vnet"],
  },
  {
    id: "users",
    group: "pages",
    label: "Users",
    subtitle: "Manage user principals",
    icon: UserIcon,
    to: "/admin/principals/users",
    visibility: "admin",
    keywords: ["administrator", "principals", "accounts"],
  },
  {
    id: "groups",
    group: "pages",
    label: "Groups",
    subtitle: "Manage group principals",
    icon: UserGroupIcon,
    to: "/admin/principals/groups",
    visibility: "admin",
    keywords: ["administrator", "principals", "roles"],
  },
  {
    id: "proxmox-sync",
    group: "pages",
    label: "Proxmox Sync",
    subtitle: "Reconcile inventory drift against Proxmox",
    icon: ReloadIcon,
    to: "/admin/proxmox-sync",
    visibility: "admin",
    keywords: ["administrator", "reconcile", "drift", "sync"],
  },
  {
    id: "audit",
    group: "pages",
    label: "Audit Logs",
    subtitle: "Review direct VM and pod action history",
    icon: Shield01Icon,
    to: "/admin/audit",
    visibility: "admin",
    keywords: ["administrator", "audit", "history", "events"],
  },
  {
    id: "docs-admin",
    group: "pages",
    label: "Admin Guide",
    subtitle: "Learn how to manage permissions, sync, and audit",
    icon: NotebookIcon,
    to: "/admin/docs",
    visibility: "admin",
    keywords: [
      "administrator",
      "guide",
      "docs",
      "help",
      "permissions",
      "sync",
      "audit",
    ],
  },
]

export const groupLabels = {
  account: "Account",
  pages: "Pages",
  docs: "Documentation",
  inventory: "Inventory",
  pods: "Pods",
  principals: "Principals",
  network: "Network",
  requests: "Requests",
} as const satisfies Record<CommandGroupKey, string>

export const groupOrder = [
  "account",
  "pods",
  "pages",
  "docs",
  "principals",
  "inventory",
  "network",
  "requests",
] as const satisfies Array<CommandGroupKey>

function principalLabel(principal: ApiPrincipal) {
  return formatPrincipalReference(principal)
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

function buildAccountCommands(actions: BuildSiteCommandsActions) {
  const themes: Array<{
    theme: CommandTheme
    icon: IconSvgElement
    label: string
  }> = [
    { theme: "light", icon: Sun01Icon, label: "Light" },
    { theme: "dark", icon: Moon02Icon, label: "Dark" },
    { theme: "system", icon: ComputerIcon, label: "System" },
  ]

  const commands: Array<SiteCommandResult> = themes.map(
    ({ theme, icon, label }) => ({
      id: `account:theme-${theme}`,
      group: "account",
      icon,
      label: `${label} theme`,
      subtitle: "Change appearance",
      keywords: ["theme", "appearance", theme],
      onSelect: runCommand(actions, () => actions.setTheme(theme)),
    })
  )

  commands.push({
    id: "account:logout",
    group: "account",
    icon: Logout01Icon,
    label: "Log out",
    subtitle: "Sign out of Kamino",
    keywords: ["logout", "sign out", "exit"],
    onSelect: runCommand(actions, actions.logout),
    variant: "destructive",
  })

  return commands
}

function buildPageCommands({
  actions,
  canAdminister,
  canManage,
}: Pick<BuildSiteCommandsParams, "actions" | "canAdminister" | "canManage">) {
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

function buildDocsCommands({
  actions,
  canAdminister,
  canManage,
  query,
}: Pick<BuildSiteCommandsParams, "actions" | "canAdminister" | "canManage"> & {
  query: string
}) {
  const matches = searchDocs(query, { canAdminister, canManage })
  return matches.map((match): SiteCommandResult => ({
    id: `docs:${match.docKey}:${match.anchor}`,
    group: "docs",
    icon: NotebookIcon,
    label: match.heading,
    subtitle: match.docTitle,
    preview: match.preview,
    keywords: [match.docTitle, match.heading, match.anchor],
    onSelect: runCommand(actions, () =>
      actions.navigateToDocsSection(match.route, match.anchor)
    ),
  }))
}

function buildInventoryCommands(
  tree: Array<ApiTreeNode>,
  actions: BuildSiteCommandsActions
) {
  const results: Array<SiteCommandResult> = []

  function walk(nodes: Array<ApiTreeNode>, parentNames: Array<string>) {
    for (const node of nodes) {
      const path =
        parentNames.length === 0
          ? "Inventory"
          : [...parentNames, node.name].join(" / ")

      if (node.kind === "vm" && node.vm) {
        appendVmCommands(results, node, path, actions)
      } else {
        appendFolderCommands(results, node, path, actions)
      }

      if (node.children) {
        walk(node.children, [...parentNames, node.name])
      }
    }
  }

  walk(tree, [])
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
    icon: isTemplate ? Copy02Icon : ComputerIcon,
    label: node.name,
    subtitle: `${vmLabel} ${vm.vmid} on ${vm.node}`,
    keywords: vmKeywords,
    onSelect: runCommand(actions, navigateToVm),
  })
}

function appendFolderCommands(
  results: Array<SiteCommandResult>,
  node: ApiTreeNode,
  path: string,
  actions: BuildSiteCommandsActions
) {
  const folderKeywords = [path, "folder", "inventory"]
  const navigateToFolder = () => actions.navigateToInventoryItem(node.id)

  results.push({
    id: `inventory:${node.id}`,
    group: "inventory",
    icon: FolderIcon,
    label: node.name,
    subtitle: path,
    keywords: folderKeywords,
    onSelect: runCommand(actions, navigateToFolder),
  })
}

function buildPodCommands({
  actions,
  podCatalog,
}: Pick<
  BuildSiteCommandsParams,
  "actions" | "canManage" | "podCatalog" | "publishedPods"
>) {
  const results: Array<SiteCommandResult> = []

  for (const pod of podCatalog ?? []) {
    results.push({
      id: `pod:${pod.id}`,
      group: "pods",
      icon: PackageIcon,
      label: pod.title,
      subtitle: "Pod",
      keywords: [
        pod.slug,
        pod.description,
        pod.source_folder,
        ...pod.creators.map((creator) => creator.label),
      ],
      onSelect: runCommand(actions, () => actions.navigateToPod(pod.slug)),
    })
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
      icon: UserIcon,
      label,
      subtitle: principal.description ?? "User principal",
      keywords: [
        principal.external_id,
        principal.full_name ?? "",
        principal.description ?? "",
        "user",
      ],
      onSelect: runCommand(actions, actions.navigateToUsers),
    })
  })
  ;(groups ?? []).forEach((principal) => {
    const label = principalLabel(principal)
    results.push({
      id: `group:${principal.id}`,
      group: "principals",
      icon: UserGroupIcon,
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
      icon: Globe02Icon,
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
      icon: GitPullRequestIcon,
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

export function buildDocsCommandsForQuery(
  query: string,
  access: Pick<BuildSiteCommandsParams, "canAdminister" | "canManage">,
  actions: BuildSiteCommandsActions
) {
  return buildDocsCommands({ ...access, actions, query })
}

export function buildSiteCommands(params: BuildSiteCommandsParams) {
  return [
    ...buildAccountCommands(params.actions),
    ...buildPageCommands(params),
    ...buildInventoryCommands(params.inventoryTree ?? [], params.actions),
    ...buildPodCommands(params),
    ...buildAdminCommands(params),
    ...buildRequestCommands(params),
  ]
}
