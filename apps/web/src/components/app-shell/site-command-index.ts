import {
  ComputerIcon,
  Copy02Icon,
  FolderClosedIcon,
  GitPullRequestIcon,
  Globe02Icon,
  Logout01Icon,
  Moon02Icon,
  NotebookIcon,
  PackageIcon,
  Sun01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import type {
  PodCatalogSummary,
  PublishedPodCatalogEntry,
} from "@/features/pods/types/pod-types"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
} from "@/features/requests/utils/request-presenters"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ApplicationPagePath } from "./application-pages"
import type { IconSvgElement } from "@hugeicons/react"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import { searchDocs } from "@/features/documentation/utils/docs-search"
import { visibleApplicationPages } from "./application-pages"

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

export type BuildSiteCommandsActions = {
  close: () => void
  logout: () => void
  navigateToDocsSection: (
    to: "/docs" | "/manager/docs" | "/admin/docs",
    hash: string
  ) => void
  navigateToInventoryItem: (itemId: string) => void
  navigateToPage: (to: ApplicationPagePath) => void
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
  podCatalog?: Array<PodCatalogSummary>
  publishedPods?: Array<PublishedPodCatalogEntry>
  users?: Array<ApiPrincipal>
  vnets?: Array<ApiVNet>
  pendingRequests?: Array<ApiRequestSummary>
}

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

export type SiteCommandRow = {
  command: SiteCommandResult
  group: CommandGroupKey
  startsGroup: boolean
}

export function buildSiteCommandRows(
  commands: Array<SiteCommandResult>
): Array<SiteCommandRow> {
  const rows: Array<SiteCommandRow> = []

  for (const group of groupOrder) {
    const groupCommands = commands.filter((command) => command.group === group)
    if (groupCommands.length === 0) continue

    for (let index = 0; index < groupCommands.length; index++) {
      rows.push({
        command: groupCommands[index],
        group,
        startsGroup: index === 0,
      })
    }
  }

  return rows
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
    onSelect: actions.logout,
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

  for (const command of visibleApplicationPages(canAdminister, canManage)) {
    commands.push({
      id: `page:${command.id}`,
      group: "pages",
      icon: command.icon,
      label: command.title,
      subtitle: command.subtitle,
      keywords: [...command.keywords],
      onSelect: runCommand(actions, () => actions.navigateToPage(command.url)),
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
    icon: FolderClosedIcon,
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
    const label = formatPrincipalReference(principal)
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
    const label = formatPrincipalReference(principal)
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
