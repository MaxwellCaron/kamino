import type {
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/features/auth/utils/management-permissions"
import type {
  ApiBulkCreateResponse,
  ApiBulkMembershipResponse,
  ApiGroupMember,
  ApiPrincipal,
  CreateGroupInput,
  CreateUserInput,
} from "../types/principals-types"
import type { ApiBulkDeleteResponse } from "@/features/shared/types/api-types"
import { apiFetch } from "@/features/auth/api/auth-api"
import { normalizeManagementPermissionGrants } from "@/features/auth/utils/management-permissions"

export type ApiGroupManagementAcl = {
  can_edit_bootstrap_only: boolean
  effective_grants: Array<ManagementPermissionKey>
  grants: Array<ManagementPermissionKey>
  group_id: string
  immutable: boolean
  sections: Array<ApiManagementPermissionSection>
}

export const usersQueryOptions = {
  queryKey: ["principals", "users"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await apiFetch("/api/v1/principals/users")
    if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
    return res.json()
  },
}

export const groupsQueryOptions = {
  queryKey: ["principals", "groups"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await apiFetch("/api/v1/principals/groups")
    if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`)
    return res.json()
  },
}

export function groupMembersQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "members"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`)
      if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`)
      return res.json()
    },
    enabled: !!groupId,
  }
}

export function groupManagementAclQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "management-access"] as const,
    queryFn: async (): Promise<ApiGroupManagementAcl> => {
      const res = await apiFetch(
        `/api/v1/principals/groups/${groupId}/management-access`
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch management access: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!groupId,
  }
}

export async function updateGroupManagementAcl(
  groupId: string,
  grants: Array<ManagementPermissionKey>
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/principals/groups/${groupId}/management-access`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grants: normalizeManagementPermissionGrants(grants),
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to update management access: ${res.status}`
    )
  }
}

export async function createUser(
  params: Array<CreateUserInput>
): Promise<ApiBulkCreateResponse> {
  const res = await apiFetch("/api/v1/principals/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create user: ${res.status}`)
  }

  return res.json()
}

export async function updateUser(
  id: string,
  params: { username: string; description?: string }
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update user: ${res.status}`)
  }
}

export async function deleteUser(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  const res = await apiFetch("/api/v1/principals/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete users: ${res.status}`)
  }
  return res.json()
}

export async function setUserPassword(
  id: string,
  password: string
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to set password: ${res.status}`)
  }
}

export async function enableUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}/enable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to enable user: ${res.status}`)
  }
}

export async function disableUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}/disable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to disable user: ${res.status}`)
  }
}

export async function createGroup(
  params: Array<CreateGroupInput>
): Promise<ApiBulkCreateResponse> {
  const res = await apiFetch("/api/v1/principals/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create group: ${res.status}`)
  }

  return res.json()
}

export async function updateGroup(
  id: string,
  params: { name: string; description?: string }
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update group: ${res.status}`)
  }
}

export async function deleteGroup(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  const res = await apiFetch("/api/v1/principals/groups", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete groups: ${res.status}`)
  }
  return res.json()
}

export async function addGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids: memberIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to add members: ${res.status}`)
  }
  return res.json()
}

export async function removeGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids: memberIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to remove members: ${res.status}`)
  }
  return res.json()
}

export function userGroupsQueryOptions(userId: string) {
  return {
    queryKey: ["principals", "users", userId, "groups"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await apiFetch(`/api/v1/principals/users/${userId}/groups`)
      if (!res.ok) throw new Error(`Failed to fetch user groups: ${res.status}`)
      return res.json()
    },
    enabled: !!userId,
  }
}

export async function triggerADSync(): Promise<void> {
  const res = await apiFetch("/api/v1/principals/sync", { method: "POST" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Sync failed: ${res.status}`)
  }
}
