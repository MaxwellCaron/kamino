"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { CommandDialog } from "@workspace/ui/components/command"
import { useTheme } from "@workspace/ui/components/theme-provider"

import {
  buildDocsCommandsForQuery,
  buildSiteCommands,
} from "./site-command-index"
import { SiteCommandMenu } from "./site-command-menu"
import { commandMatchesQuery } from "./site-command-search"
import type { BuildSiteCommandsActions } from "./site-command-index"
import { authSessionQueryOptions, logout } from "@/features/auth/api/auth-api"
import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { useOptionalInventoryTreeContext } from "@/features/inventory/components/tree/inventory-tree-context"
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
  const inventoryTreeContext = useOptionalInventoryTreeContext()
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
      navigateToGroups: () => navigate({ to: "/admin/principals/groups" }),
      navigateToDocsSection: (to, hash) => {
        close()
        navigate({ to, hash })
      },
      navigateToInventoryItem: (itemId: string) => {
        if (inventoryTreeContext) {
          inventoryTreeContext.revealAndNavigateToItem(itemId)
          return
        }
        navigate({
          to: "/inventory/items/$itemId",
          params: { itemId },
        })
      },
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
    [close, inventoryTreeContext, logoutMutation, navigate, setTheme]
  )

  const baseCommands = useMemo(() => {
    if (!sessionData?.user) return []

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
    sessionData,
    users,
    vnets,
  ])

  const docsCommands = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return []

    return buildDocsCommandsForQuery(
      query,
      { canAdminister, canManage },
      commandActions
    )
  }, [canAdminister, canManage, commandActions, searchQuery])

  const filteredCommands = useMemo(() => {
    const query = searchQuery.trim()
    const filteredBase = query
      ? baseCommands.filter((command) => commandMatchesQuery(command, query))
      : baseCommands

    return query ? [...filteredBase, ...docsCommands] : filteredBase
  }, [baseCommands, docsCommands, searchQuery])

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

  const emptyMessage = isIndexing
    ? "Indexing Kamino..."
    : hasIndexError
      ? "Some results could not be loaded."
      : "No results found."

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="top-1/2 max-w-xl! -translate-y-1/2"
    >
      <SiteCommandMenu
        commands={filteredCommands}
        emptyMessage={emptyMessage}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
    </CommandDialog>
  )
}
