export type ApiPrincipal = {
  id: string
  external_id: string
  name: string | null
  description: string | null
}

export type ApiGroupMember = {
  id: string
  principal_type: "user" | "group"
  external_id: string
  name: string | null
  description: string | null
}

export type ApiBulkDeleteFailure = {
  id: string
  error: string
}

export type ApiBulkDeleteResponse = {
  deleted: Array<string>
  failed: Array<ApiBulkDeleteFailure>
}

export type ApiBulkMembershipResponse = {
  succeeded: Array<string>
  failed: Array<ApiBulkDeleteFailure>
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

export type CreateUserInput = {
  username: string
  password: string
  description?: string
  group_ids?: Array<string>
}

export type CreateGroupInput = {
  name: string
  description?: string
}
