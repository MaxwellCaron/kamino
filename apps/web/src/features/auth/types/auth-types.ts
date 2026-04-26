export type AuthUser = {
  id: string
  username: string
  management_permissions: ApiManagementPermissions
}

export type AuthSession = {
  user: AuthUser
  access_token_expires_at: string
}
