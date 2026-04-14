import type { ApiTreeNode } from "@/lib/queries"

export type InventoryPermissionsDialogProps = {
  itemId: string
  itemKind: ApiTreeNode["kind"]
  itemName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}

export type PermissionState = "allow" | "deny" | "inherit"

export type PrincipalOption = {
  description: string
  id: string
  label: string
  type: "group" | "user"
}

export type DraftScope = {
  allowMask: number
  denyMask: number
}

export type DraftPrincipal = {
  immutable?: boolean
  principalExternalId?: string
  principalId: string
  principalName?: string | null
  principalType?: "group" | "user"
  self: DraftScope
}

export type DraftAcl = {
  principals: Array<DraftPrincipal>
}

export type InheritedPrincipal = {
  immutable?: boolean
  principalExternalId?: string
  principalId: string
  principalName?: string | null
  principalType?: "group" | "user"
  sourceItemNames: Array<string>
}

export type PrincipalListSectionKey =
  | "inherited-groups"
  | "inherited-users"
  | "groups"
  | "users"

export type PrincipalListItem = {
  principalId: string
  principalType: "group" | "user" | undefined
  label: string
  hasDraftEntry: boolean
  hasOverrides: boolean
  hasInheritedPermissions: boolean
  immutable: boolean
  section: PrincipalListSectionKey
}
