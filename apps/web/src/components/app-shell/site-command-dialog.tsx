"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command"

import {
  buildSiteCommands,
  groupLabels,
  groupOrder,
} from "./site-command-index"
import { commandMatchesQuery } from "./site-command-search"
import type { BuildSiteCommandsActions } from "./site-command-index"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { useOptionalInventoryDialogs } from "@/features/inventory/components/inventory-dialogs-provider"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  podCatalogQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import { requestsQueryOptions } from "@/features/requests/api/requests-api"
import { vnetsQueryOptions } from "@/features/sdn/api/sdn-api"

export function SiteCommandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const inventoryDialogs = useOptionalInventoryDialogs()
  const [searchQuery, setSearchQuery] = useState("")

  const sessionQuery = useQuery(authSessionQueryOptions)
  const user = sessionQuery.data?.user
  const canManage = canAccessRequestQueue(user?.management_permissions)
  const canAdminister = canAccessAdmin(user?.management_permissions)

  const inventoryQuery = useQuery(inventoryTreeQueryOptions)
  const podCatalogQuery = useQuery(podCatalogQueryOptions)
  const publishedPodsQuery = useQuery({
    ...publishedPodsQueryOptions,
    enabled: canManage,
  })
  const usersQuery = useQuery({
    ...usersQueryOptions,
    enabled: canAdminister,
  })
  const groupsQuery = useQuery({
    ...groupsQueryOptions,
    enabled: canAdminister,
  })
  const vnetsQuery = useQuery({
    ...vnetsQueryOptions,
    enabled: canAdminister,
  })
  const pendingRequestsQuery = useQuery({
    ...requestsQueryOptions("pending"),
    enabled: canManage,
  })
  const completedRequestsQuery = useQuery({
    ...requestsQueryOptions("completed"),
    enabled: canManage,
  })

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const commandActions = useMemo<BuildSiteCommandsActions>(
    () => ({
      close,
      navigateHome: () => navigate({ to: "/" }),
      navigateToGroups: () => navigate({ to: "/admin/principals/groups" }),
      navigateToInventoryItem: (itemId: string) =>
        navigate({
          to: "/inventory/items/$itemId",
          params: { itemId },
        }),
      navigateToPage: (to) => navigate({ to }),
      navigateToPod: (podSlug: string) =>
        navigate({ to: "/pods/$podSlug", params: { podSlug } }),
      navigateToPublishedPod: (podId: string) =>
        navigate({
          to: "/pods/publish",
          search: { podId },
        }),
      navigateToRequests: () => navigate({ to: "/manager/requests" }),
      navigateToSdn: () => navigate({ to: "/admin/sdn" }),
      navigateToUsers: () => navigate({ to: "/admin/principals/users" }),
      openClone: inventoryDialogs?.openClone,
      openCreateFolder: inventoryDialogs?.openCreateFolder,
      openCreateVm: inventoryDialogs?.openCreateVm,
      openEditVmHardware: inventoryDialogs?.openEditVmHardware,
      openFolderLimit: inventoryDialogs?.openFolderLimit,
      openPermissions: inventoryDialogs?.openPermissions,
      openRenameFolder: inventoryDialogs?.openRenameFolder,
      openRenameVm: inventoryDialogs?.openRenameVm,
      openSnapshot: inventoryDialogs?.openSnapshot,
    }),
    [close, inventoryDialogs, navigate]
  )

  const commands = useMemo(() => {
    if (!user) return []

    return buildSiteCommands({
      actions: commandActions,
      canAdminister,
      canManage,
      completedRequests: completedRequestsQuery.data,
      groups: groupsQuery.data,
      inventoryTree: inventoryQuery.data,
      pendingRequests: pendingRequestsQuery.data,
      podCatalog: podCatalogQuery.data,
      publishedPods: publishedPodsQuery.data,
      users: usersQuery.data,
      vnets: vnetsQuery.data,
    })
  }, [
    canAdminister,
    canManage,
    commandActions,
    completedRequestsQuery.data,
    groupsQuery.data,
    inventoryQuery.data,
    pendingRequestsQuery.data,
    podCatalogQuery.data,
    publishedPodsQuery.data,
    user,
    usersQuery.data,
    vnetsQuery.data,
  ])

  const filteredCommands = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) {
      return commands
    }

    return commands.filter((command) => commandMatchesQuery(command, query))
  }, [commands, searchQuery])

  const groupedCommands = useMemo(() => {
    return groupOrder
      .map((group) => ({
        group,
        commands: filteredCommands.filter((command) => command.group === group),
      }))
      .filter((group) => group.commands.length > 0)
  }, [filteredCommands])

  const isIndexing =
    sessionQuery.isLoading ||
    inventoryQuery.isLoading ||
    podCatalogQuery.isLoading ||
    (canManage &&
      (publishedPodsQuery.isLoading ||
        pendingRequestsQuery.isLoading ||
        completedRequestsQuery.isLoading)) ||
    (canAdminister &&
      (usersQuery.isLoading || groupsQuery.isLoading || vnetsQuery.isLoading))
  const hasIndexError =
    inventoryQuery.isError ||
    podCatalogQuery.isError ||
    publishedPodsQuery.isError ||
    pendingRequestsQuery.isError ||
    completedRequestsQuery.isError ||
    usersQuery.isError ||
    groupsQuery.isError ||
    vnetsQuery.isError

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="top-1/2 max-w-xl! -translate-y-1/2"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search Kamino..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList className="max-h-[min(70dvh,42rem)]">
          <CommandEmpty>
            {isIndexing
              ? "Indexing Kamino..."
              : hasIndexError
                ? "Some results could not be loaded."
                : "No results found."}
          </CommandEmpty>
          {groupedCommands.map(({ group, commands: groupCommands }, index) => (
            <div key={group}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={groupLabels[group]}>
                {groupCommands.map((command) => {
                  const Icon = command.icon
                  return (
                    <CommandItem
                      key={command.id}
                      value={`${command.label} ${command.subtitle} ${command.id}`}
                      keywords={command.keywords}
                      onSelect={command.onSelect}
                    >
                      <Icon />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{command.label}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {command.subtitle}
                        </span>
                      </span>
                      {command.shortcut && (
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
