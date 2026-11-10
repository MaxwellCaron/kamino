import type {
  DraftPrincipal,
  PrincipalListSectionKey,
} from "@/lib/inventory/inventory-types"
import { normalizeScope } from "@/lib/inventory/acl-transformers"

type AclEntry = {
  effect: "allow" | "deny"
  permissions: number
  principal_id: string
}

export function cloneDraftPrincipal(principal: DraftPrincipal): DraftPrincipal {
  return {
    ...principal,
    self: { ...principal.self },
  }
}

export function toAclEntries(
  principals: Array<DraftPrincipal>
): Array<AclEntry> {
  return principals.flatMap((principal) => {
    const scope = normalizeScope(principal.self)
    const entries: Array<AclEntry> = []

    if (scope.allowMask > 0) {
      entries.push({
        principal_id: principal.principalId,
        effect: "allow",
        permissions: scope.allowMask,
      })
    }

    if (scope.denyMask > 0) {
      entries.push({
        principal_id: principal.principalId,
        effect: "deny",
        permissions: scope.denyMask,
      })
    }

    return entries
  })
}

function getAclEntryKey(entry: AclEntry) {
  return `${entry.principal_id}:${entry.effect}:${entry.permissions}`
}

export function aclEntriesEqual(left: Array<AclEntry>, right: Array<AclEntry>) {
  if (left.length !== right.length) return false

  const sortedLeft = left.map(getAclEntryKey).sort()
  const sortedRight = right.map(getAclEntryKey).sort()
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((entry, index) => entry === sortedRight[index])
  )
}

export const principalSectionLabels: Record<PrincipalListSectionKey, string> = {
  "inherited-groups": "Inherited Groups",
  "inherited-users": "Inherited Users",
  groups: "Groups",
  users: "Users",
}
