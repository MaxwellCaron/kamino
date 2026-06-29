"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"

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
import { useTheme } from "@workspace/ui/components/theme-provider"

import {
  buildSiteCommands,
  groupLabels,
  groupOrder,
} from "./site-command-index"
import { commandMatchesQuery } from "./site-command-search"
import type { BuildSiteCommandsActions } from "./site-command-index"
import { authSessionQueryOptions, logout } from "@/features/auth/api/auth-api"
import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  podCatalogQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import { requestSummariesQueryOptions } from "@/features/requests/api/requests-api"
import { vnetsQueryOptions } from "@/features/sdn/api/sdn-api"

export function SiteCommandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState("")

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      router.navigate({ to: "/login" })
    },
  })

  const { data: sessionData, isLoading: isSessionLoading } = useQuery(
    authSessionQueryOptions
  )
  const user = sessionData?.user
  const canManage = canAccessRequestQueue(user?.management_permissions)
  const canAdminister = canAccessAdmin(user?.management_permissions)

  const {
    data: inventoryTree,
    isError: isInventoryError,
    isLoading: isInventoryLoading,
  } = useQuery(inventoryTreeQueryOptions)
  const {
    data: podCatalog,
    isError: isPodCatalogError,
    isLoading: isPodCatalogLoading,
  } = useQuery(podCatalogQueryOptions)
  const {
    data: publishedPods,
    isError: isPublishedPodsError,
    isLoading: isPublishedPodsLoading,
  } = useQuery({
    ...publishedPodsQueryOptions,
    enabled: canManage,
  })
  const {
    data: users,
    isError: isUsersError,
    isLoading: isUsersLoading,
  } = useQuery({
    ...usersQueryOptions,
    enabled: canAdminister,
  })
  const {
    data: groups,
    isError: isGroupsError,
    isLoading: isGroupsLoading,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: canAdminister,
  })
  const {
    data: vnets,
    isError: isVnetsError,
    isLoading: isVnetsLoading,
  } = useQuery({
    ...vnetsQueryOptions,
    enabled: canAdminister,
  })
  const {
    data: pendingRequests,
    isError: isPendingRequestsError,
    isLoading: isPendingRequestsLoading,
  } = useQuery({
    ...requestSummariesQueryOptions("pending"),
    enabled: canManage,
  })
  const {
    data: completedRequests,
    isError: isCompletedRequestsError,
    isLoading: isCompletedRequestsLoading,
  } = useQuery({
    ...requestSummariesQueryOptions("completed"),
    enabled: canManage,
  })

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const commandActions = useMemo<BuildSiteCommandsActions>(
    () => ({
      close,
      logout: () => logoutMutation.mutate(),
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
      setTheme,
    }),
    [close, logoutMutation, navigate, setTheme]
  )

  const commands = useMemo(() => {
    if (!user) return []

    return buildSiteCommands({
      actions: commandActions,
      canAdminister,
      canManage,
      completedRequests,
      groups,
      inventoryTree,
      pendingRequests,
      podCatalog,
      publishedPods,
      users,
      vnets,
    })
  }, [
    canAdminister,
    canManage,
    commandActions,
    completedRequests,
    groups,
    inventoryTree,
    pendingRequests,
    podCatalog,
    publishedPods,
    user,
    users,
    vnets,
  ])

  const filteredCommands = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) {
      return commands
    }

    return commands.filter((command) => commandMatchesQuery(command, query))
  }, [commands, searchQuery])

  const groupedCommands = useMemo(() => {
    const commandGroups: Array<{
      group: (typeof groupOrder)[number]
      commands: typeof filteredCommands
    }> = []

    for (const group of groupOrder) {
      const groupCommands = filteredCommands.filter(
        (command) => command.group === group
      )
      if (groupCommands.length > 0) {
        commandGroups.push({ group, commands: groupCommands })
      }
    }

    return commandGroups
  }, [filteredCommands])

  const isIndexing =
    isSessionLoading ||
    isInventoryLoading ||
    isPodCatalogLoading ||
    (canManage &&
      (isPublishedPodsLoading ||
        isPendingRequestsLoading ||
        isCompletedRequestsLoading)) ||
    (canAdminister && (isUsersLoading || isGroupsLoading || isVnetsLoading))
  const hasIndexError =
    isInventoryError ||
    isPodCatalogError ||
    isPublishedPodsError ||
    isPendingRequestsError ||
    isCompletedRequestsError ||
    isUsersError ||
    isGroupsError ||
    isVnetsError

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
                  return (
                    <CommandItem
                      key={command.id}
                      value={`${command.label} ${command.subtitle} ${command.id}`}
                      keywords={command.keywords}
                      onSelect={command.onSelect}
                      variant={command.variant}
                    >
                      <HugeiconsIcon icon={command.icon} />
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
