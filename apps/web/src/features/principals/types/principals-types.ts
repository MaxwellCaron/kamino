import type { ApiBulkOperationFailure } from "@/features/shared/types/api-types"

export type ApiPrincipal = {
  id: string
  external_id: string
  name: string | null
  full_name: string | null
  description: string | null
  created_at?: string | null
  status?: boolean | null
}

export type ApiGroupMember = {
  id: string
  principal_type: "user" | "group"
  external_id: string
  name: string | null
  full_name: string | null
  description: string | null
}

export type ApiBulkMembershipResponse = {
  succeeded: Array<string>
  failed: Array<ApiBulkOperationFailure>
}

export type ApiBulkCreateFailure = {
  name: string
  error: string
}

export type ApiBulkCreateResponse = {
  successful: number
  total: number
  failures: Array<ApiBulkCreateFailure>
}

export type ApiPrincipalProviderCapabilities = {
  provider_type: "active_directory" | "proxmox" | "system"
  display_name: string
  can_sync: boolean
  can_create_users: boolean
  user_password_on_create: boolean
  can_rename_users: boolean
  can_set_passwords: boolean
  can_change_own_password: boolean
  can_enable_users: boolean
  can_disable_users: boolean
  can_create_groups: boolean
  can_manage_memberships: boolean
}

export type CreateUserInput = {
  username: string
  password?: string
  description?: string
  group_ids?: Array<string>
}

export type CreateGroupInput = {
  name: string
  description?: string
}
