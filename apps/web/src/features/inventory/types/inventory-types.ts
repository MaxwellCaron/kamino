export type ApiTreeNodeVM = {
  node: string
  vmid: number
  is_template: boolean
  notes?: string | null
  cpu_count?: number
  memory_mb?: number
  disk_gb?: number
}

export type ApiTreeNodePermissions = {
  allowed_mask: number
  denied_mask: number
  request_mask: number
}

export type ApiTreeNode = {
  id: string
  name: string
  kind: "folder" | "vm"
  permissions: ApiTreeNodePermissions
  children?: Array<ApiTreeNode>
  vm?: ApiTreeNodeVM
}

export type ApiInventoryItem = {
  id: string
  parent_id: string | null
  kind: "folder" | "vm"
  name: string
  inherit_permissions: boolean
  permissions: ApiTreeNodePermissions
  vm?: ApiTreeNodeVM
}

export type ApiVmMutationResult = {
  vmid: number
  item_id: string
  item: ApiInventoryItem
}

export type ApiInventoryAclEntry = {
  id: string
  principal_id: string
  principal_type: "user" | "group"
  principal_external_id: string
  principal_name: string | null
  effect: "allow" | "deny"
  permissions: number
  immutable: boolean
}

export type ApiInheritedInventoryAclEntry = {
  id: string
  source_item_id: string
  source_item_name: string
  principal_id: string
  principal_type: "user" | "group"
  principal_external_id: string
  principal_name: string | null
  effect: "allow" | "deny"
  permissions: number
  immutable: boolean
}

export type ApiInventoryAcl = {
  entries: Array<ApiInventoryAclEntry>
  inherited_entries: Array<ApiInheritedInventoryAclEntry>
}

// From permissions/types.ts

export type InventoryPermissionsDialogProps = {
  itemId: string
  itemKind: ApiTreeNode["kind"]
  itemName: string
  itemVmid?: number
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
