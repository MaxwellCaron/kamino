import type { ManagementPermissionKey } from "../utils/management-permissions"

export type ApiManagementPermissions = {
  grants: Array<ManagementPermissionKey>
}

export type AuthUser = {
  id: string
  group_count: number
  username: string
  management_permissions: ApiManagementPermissions
}

export type AuthSession = {
  user: AuthUser
  access_token_expires_at: string
}
