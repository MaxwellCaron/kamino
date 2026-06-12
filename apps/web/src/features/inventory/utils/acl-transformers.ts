import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type {
  ApiInheritedInventoryAclEntry,
  ApiInventoryAcl,
  ApiInventoryAclEntry,
  DraftAcl,
  DraftPrincipal,
  DraftScope,
  InheritedPrincipal,
  PermissionState,
  PrincipalListSectionKey,
  PrincipalOption,
} from "../types/inventory-types"

function createEmptyScope(): DraftScope {
  return { allowMask: 0, denyMask: 0 }
}

export function createEmptyPrincipal(
  principal: Pick<
    PrincipalOption,
    "description" | "id" | "label" | "type"
  > | null
): DraftPrincipal {
  return {
    principalId: principal?.id ?? "",
    principalType: principal?.type,
    principalName: principal?.label ?? null,
    principalExternalId: principal?.description,
    self: createEmptyScope(),
  }
}

function mergeScopeEntry(
  scope: DraftScope,
  effect: ApiInventoryAclEntry["effect"],
  permissions: number
): DraftScope {
  const isDeny = effect === "deny"
  return {
    allowMask: isDeny ? scope.allowMask : scope.allowMask | permissions,
    denyMask: isDeny ? scope.denyMask | permissions : scope.denyMask,
  }
}

export function createDraftAcl(data: ApiInventoryAcl): DraftAcl {
  const principalsMap = new Map<string, DraftPrincipal>()
  const order: Array<string> = []

  for (const entry of data.entries) {
    let principal = principalsMap.get(entry.principal_id)
    if (!principal) {
      principal = {
        immutable: entry.immutable,
        principalId: entry.principal_id,
        principalType: entry.principal_type,
        principalName: entry.principal_name,
        principalExternalId: entry.principal_external_id,
        self: createEmptyScope(),
      }
      principalsMap.set(entry.principal_id, principal)
      order.push(entry.principal_id)
    }

    principal.self = mergeScopeEntry(
      principal.self,
      entry.effect,
      entry.permissions
    )
  }

  return {
    principals: order
      .map((id) => principalsMap.get(id))
      .filter((p): p is DraftPrincipal => !!p),
  }
}

export function createInheritedPrincipals(
  entries: Array<ApiInheritedInventoryAclEntry>
): Array<InheritedPrincipal> {
  const principalsMap = new Map<string, InheritedPrincipal>()
  const sourceNameSets = new Map<string, Set<string>>()

  for (const entry of entries) {
    const principal = principalsMap.get(entry.principal_id) ?? {
      immutable: entry.immutable,
      principalId: entry.principal_id,
      principalType: entry.principal_type,
      principalName: entry.principal_name,
      principalExternalId: entry.principal_external_id,
      sourceItemNames: [],
    }

    let sourceNames = sourceNameSets.get(entry.principal_id)
    if (!sourceNames) {
      sourceNames = new Set<string>()
      sourceNameSets.set(entry.principal_id, sourceNames)
    }

    if (!sourceNames.has(entry.source_item_name)) {
      sourceNames.add(entry.source_item_name)
      principal.sourceItemNames.push(entry.source_item_name)
    }
    principalsMap.set(entry.principal_id, principal)
  }

  return [...principalsMap.values()]
}

const hasScopeOverrides = (scope: DraftScope) =>
  scope.allowMask !== 0 || scope.denyMask !== 0

export const hasPrincipalOverrides = (p: DraftPrincipal) =>
  hasScopeOverrides(p.self)

export const normalizeScope = (scope: DraftScope): DraftScope => ({
  allowMask: scope.allowMask & ~scope.denyMask,
  denyMask: scope.denyMask,
})

export function buildPrincipalOptions(
  users: Array<ApiPrincipal>,
  groups: Array<ApiPrincipal>
): Array<PrincipalOption> {
  const userIds = new Set(users.map((u) => u.id))
  return [...users, ...groups]
    .map(
      (p): PrincipalOption => ({
        id: p.id,
        type: userIds.has(p.id) ? "user" : "group",
        label: p.name ?? p.external_id,
        description: p.external_id,
      })
    )
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    )
}

export function getPermissionState(
  scope: DraftScope,
  bit: number
): PermissionState {
  if ((scope.denyMask & bit) === bit) return "deny"
  if ((scope.allowMask & bit) === bit) return "allow"
  return "inherit"
}

export function setPermissionState(
  scope: DraftScope,
  bit: number,
  state: PermissionState
): DraftScope {
  return {
    allowMask:
      state === "allow" ? scope.allowMask | bit : scope.allowMask & ~bit,
    denyMask: state === "deny" ? scope.denyMask | bit : scope.denyMask & ~bit,
  }
}

export function getPrincipalSectionKey({
  hasInheritedPermissions,
  principalType,
}: {
  hasInheritedPermissions: boolean
  principalType?: "group" | "user"
}): PrincipalListSectionKey {
  if (hasInheritedPermissions) {
    return principalType === "group" ? "inherited-groups" : "inherited-users"
  }
  return principalType === "group" ? "groups" : "users"
}
