import {
  groupsQueryOptions,
  principalProviderQueryOptions,
  usersQueryOptions,
} from "@/lib/principals/principals-api"
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
