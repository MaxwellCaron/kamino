import {
  groupsQueryOptions,
  principalProviderQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import type { QueryClient } from "@tanstack/react-query"

export async function preloadUsersPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(usersQueryOptions),
    queryClient.ensureQueryData(principalProviderQueryOptions),
  ])
}

export async function preloadGroupsPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(groupsQueryOptions),
    queryClient.ensureQueryData(principalProviderQueryOptions),
  ])
}
