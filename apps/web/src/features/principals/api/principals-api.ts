import type {
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/features/auth/utils/management-permissions"
import type {
  ApiBulkCreateResponse,
  ApiBulkMembershipResponse,
  ApiGroupMember,
  ApiPrincipal,
  ApiPrincipalProviderCapabilities,
  CreateGroupInput,
  CreateUserInput,
} from "../types/principals-types"
import type { ApiBulkDeleteResponse } from "@/features/shared/types/api-types"
import { normalizeManagementPermissionGrants } from "@/features/auth/utils/management-permissions"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export type ApiGroupManagementAcl = {
  can_edit_bootstrap_only: boolean
  effective_grants: Array<ManagementPermissionKey>
  grants: Array<ManagementPermissionKey>
  group_id: string
  immutable: boolean
  sections: Array<ApiManagementPermissionSection>
}

export const principalProviderQueryOptions = {
  queryKey: ["principals", "provider"] as const,
  queryFn: (): Promise<ApiPrincipalProviderCapabilities> =>
    apiJson<ApiPrincipalProviderCapabilities>(
      "/api/v1/principals/provider",
      "fetch principal provider"
    ),
}

export const usersQueryOptions = {
  queryKey: ["principals", "users"] as const,
  queryFn: (): Promise<Array<ApiPrincipal>> =>
    apiJson<Array<ApiPrincipal>>("/api/v1/principals/users", "fetch users"),
}

export const groupsQueryOptions = {
  queryKey: ["principals", "groups"] as const,
  queryFn: (): Promise<Array<ApiPrincipal>> =>
    apiJson<Array<ApiPrincipal>>("/api/v1/principals/groups", "fetch groups"),
}

export function groupMembersQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "members"] as const,
    queryFn: (): Promise<Array<ApiGroupMember>> =>
      apiJson<Array<ApiGroupMember>>(
        `/api/v1/principals/groups/${groupId}/members`,
        "fetch members"
      ),
    enabled: !!groupId,
  }
}

export function groupManagementAclQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "management-access"] as const,
    queryFn: (): Promise<ApiGroupManagementAcl> =>
      apiJson<ApiGroupManagementAcl>(
        `/api/v1/principals/groups/${groupId}/management-access`,
        "fetch management access"
      ),
    enabled: !!groupId,
  }
}

export async function updateGroupManagementAcl(
  groupId: string,
  grants: Array<ManagementPermissionKey>
): Promise<void> {
  await apiVoid(
    `/api/v1/principals/groups/${groupId}/management-access`,
    "update management access",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grants: normalizeManagementPermissionGrants(grants),
      }),
    }
  )
}

export async function createUser(
  params: Array<CreateUserInput>
): Promise<ApiBulkCreateResponse> {
  return apiJson<ApiBulkCreateResponse>(
    "/api/v1/principals/users",
    "create user",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}

export async function updateUser(
  id: string,
  params: { username: string; full_name?: string; description?: string }
): Promise<void> {
  await apiVoid(`/api/v1/principals/users/${id}`, "update user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
}

export async function deleteUser(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  return apiJson<ApiBulkDeleteResponse>(
    "/api/v1/principals/users",
    "delete users",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }
  )
}

export async function setUserPassword(
  id: string,
  password: string
): Promise<void> {
  await apiVoid(`/api/v1/principals/users/${id}/password`, "set password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
}

export async function createGroup(
  params: Array<CreateGroupInput>
): Promise<ApiBulkCreateResponse> {
  return apiJson<ApiBulkCreateResponse>(
    "/api/v1/principals/groups",
    "create group",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}

export async function updateGroup(
  id: string,
  params: { name: string; description?: string }
): Promise<void> {
  await apiVoid(`/api/v1/principals/groups/${id}`, "update group", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
}

export async function deleteGroup(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  return apiJson<ApiBulkDeleteResponse>(
    "/api/v1/principals/groups",
    "delete groups",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }
  )
}

export async function addGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  return apiJson<ApiBulkMembershipResponse>(
    `/api/v1/principals/groups/${groupId}/members`,
    "add members",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: memberIds }),
    }
  )
}

export async function removeGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  return apiJson<ApiBulkMembershipResponse>(
    `/api/v1/principals/groups/${groupId}/members`,
    "remove members",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: memberIds }),
    }
  )
}

export function userGroupsQueryOptions(userId: string) {
  return {
    queryKey: ["principals", "users", userId, "groups"] as const,
    queryFn: (): Promise<Array<ApiGroupMember>> =>
      apiJson<Array<ApiGroupMember>>(
        `/api/v1/principals/users/${userId}/groups`,
        "fetch user groups"
      ),
    enabled: !!userId,
  }
}

export async function triggerPrincipalSync(): Promise<void> {
  await apiVoid("/api/v1/principals/sync", "Sync", { method: "POST" })
}
