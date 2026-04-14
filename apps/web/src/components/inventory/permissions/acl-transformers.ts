import type {
  ApiInheritedInventoryAclEntry,
  ApiInventoryAcl,
  ApiInventoryAclEntry,
  ApiPrincipal,
} from "@/lib/queries"
import type {
  DraftAcl,
  DraftPrincipal,
  DraftScope,
  InheritedPrincipal,
  PermissionState,
  PrincipalListSectionKey,
  PrincipalOption,
} from "./types"

export function createEmptyScope(): DraftScope {
  return {
    allowMask: 0,
    denyMask: 0,
  }
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

export function mergeScopeEntry(
  scope: DraftScope,
  effect: ApiInventoryAclEntry["effect"],
  permissions: number
) {
  if (effect === "deny") {
    return {
      allowMask: scope.allowMask,
      denyMask: scope.denyMask | permissions,
    }
  }

  return {
    allowMask: scope.allowMask | permissions,
    denyMask: scope.denyMask,
  }
}

export function createDraftAcl(data: ApiInventoryAcl): DraftAcl {
  const principals = new Map<string, DraftPrincipal>()
  const order: Array<string> = []

  for (const entry of data.entries) {
    let principal = principals.get(entry.principal_id)
    if (!principal) {
      principal = {
        immutable: entry.immutable,
        principalId: entry.principal_id,
        principalType: entry.principal_type,
        principalName: entry.principal_name,
        principalExternalId: entry.principal_external_id,
        self: createEmptyScope(),
      }
      principals.set(entry.principal_id, principal)
      order.push(entry.principal_id)
    }

    if (
      (entry.applies_to_self && !entry.inherited_only) ||
      entry.applies_to_children
    ) {
      principal.self = mergeScopeEntry(
        principal.self,
        entry.effect,
        entry.permissions
      )
    }
  }

  return {
    principals: order
      .map((principalId) => principals.get(principalId))
      .filter((principal): principal is DraftPrincipal => Boolean(principal)),
  }
}

export function createInheritedPrincipals(
  entries: Array<ApiInheritedInventoryAclEntry>
): Array<InheritedPrincipal> {
  const principals = new Map<string, InheritedPrincipal>()

  for (const entry of entries) {
    let principal = principals.get(entry.principal_id)
    if (!principal) {
      principal = {
        immutable: entry.immutable,
        principalId: entry.principal_id,
        principalType: entry.principal_type,
        principalName: entry.principal_name,
        principalExternalId: entry.principal_external_id,
        sourceItemNames: [],
      }
      principals.set(entry.principal_id, principal)
    }

    if (!principal.sourceItemNames.includes(entry.source_item_name)) {
      principal.sourceItemNames.push(entry.source_item_name)
    }
  }

  return [...principals.values()]
}

export function hasScopeOverrides(scope: DraftScope) {
  return scope.allowMask !== 0 || scope.denyMask !== 0
}

export function hasPrincipalOverrides(principal: DraftPrincipal) {
  return hasScopeOverrides(principal.self)
}

export function normalizeScope(scope: DraftScope): DraftScope {
  return {
    allowMask: scope.allowMask & ~scope.denyMask,
    denyMask: scope.denyMask,
  }
}

export function normalizeDraftAcl(draft: DraftAcl | null): DraftAcl | null {
  if (!draft) return null

  return {
    principals: draft.principals
      .map((principal) => ({
        ...principal,
        self: normalizeScope(principal.self),
      }))
      .filter(hasPrincipalOverrides),
  }
}

export function serializeDraftAcl(draft: DraftAcl | null) {
  const normalizedDraft = normalizeDraftAcl(draft)
  if (!normalizedDraft) return ""

  return JSON.stringify({
    principals: normalizedDraft.principals.map((principal) => ({
      principalId: principal.principalId,
      self: principal.self,
    })),
  })
}

export function buildPrincipalOptions(
  users: Array<ApiPrincipal>,
  groups: Array<ApiPrincipal>
): Array<PrincipalOption> {
  const options = [
    ...users.map((principal) => ({
      id: principal.id,
      type: "user" as const,
      label: principal.name ?? principal.external_id,
      description: principal.external_id,
    })),
    ...groups.map((principal) => ({
      id: principal.id,
      type: "group" as const,
      label: principal.name ?? principal.external_id,
      description: principal.external_id,
    })),
  ]

  return options.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    })
  )
}

export function getPrincipalLabel(
  principal: DraftPrincipal,
  principalMap: Map<string, PrincipalOption>
) {
  const option = principalMap.get(principal.principalId)
  if (option) return option.label

  return (
    principal.principalName ??
    principal.principalExternalId ??
    principal.principalId
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
  if (state === "allow") {
    return {
      allowMask: scope.allowMask | bit,
      denyMask: scope.denyMask & ~bit,
    }
  }

  if (state === "deny") {
    return {
      allowMask: scope.allowMask & ~bit,
      denyMask: scope.denyMask | bit,
    }
  }

  return {
    allowMask: scope.allowMask & ~bit,
    denyMask: scope.denyMask & ~bit,
  }
}

export function getPrincipalSectionKey(params: {
  hasInheritedPermissions: boolean
  principalType?: "group" | "user"
}): PrincipalListSectionKey {
  if (params.hasInheritedPermissions) {
    return params.principalType === "group"
      ? "inherited-groups"
      : "inherited-users"
  }

  return params.principalType === "group" ? "groups" : "users"
}
