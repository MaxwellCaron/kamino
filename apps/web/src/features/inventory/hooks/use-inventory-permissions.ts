import React from "react"
import { toast } from "sonner"

import {
  buildPrincipalOptions,
  createDraftAcl,
  createEmptyPrincipal,
  createInheritedPrincipals,
  getPrincipalSectionKey,
  hasPrincipalOverrides,
  normalizeScope,
  setPermissionState,
} from "../utils/acl-transformers"
import { getInventoryPermissionDefinitionsByGroup } from "../utils/inventory-permissions"
import { useUpdateInventoryAcl } from "./use-inventory-actions"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type {
  ApiInventoryAcl,
  ApiTreeNode,
  DraftPrincipal,
  PermissionState,
  PrincipalListItem,
  PrincipalListSectionKey,
  PrincipalOption,
} from "../types/inventory-types"
import { formatToastError } from "@/features/shared/utils/format"

type AclEntry = {
  effect: "allow" | "deny"
  permissions: number
  principal_id: string
}

function cloneDraftPrincipal(principal: DraftPrincipal): DraftPrincipal {
  return {
    ...principal,
    self: { ...principal.self },
  }
}

function toAclEntries(principals: Array<DraftPrincipal>): Array<AclEntry> {
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

function aclEntriesEqual(left: Array<AclEntry>, right: Array<AclEntry>) {
  if (left.length !== right.length) return false

  const sortedLeft = left.map(getAclEntryKey).sort()
  const sortedRight = right.map(getAclEntryKey).sort()
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((entry, index) => entry === sortedRight[index])
  )
}

const principalSectionLabels: Record<PrincipalListSectionKey, string> = {
  "inherited-groups": "Inherited Groups",
  "inherited-users": "Inherited Users",
  groups: "Groups",
  users: "Users",
}

export function useInventoryPermissions({
  itemId,
  itemKind,
  itemName,
  onOpenChange,
  aclData,
  users,
  groups,
}: {
  itemId: string
  itemKind: ApiTreeNode["kind"]
  itemName: string
  onOpenChange: (open: boolean) => void
  aclData: ApiInventoryAcl
  users: Array<ApiPrincipal>
  groups: Array<ApiPrincipal>
}) {
  const updateAcl = useUpdateInventoryAcl()

  const [editingPrincipal, setEditingPrincipal] =
    React.useState<DraftPrincipal | null>(null)
  const initialDraftPrincipals = React.useMemo(
    () => createDraftAcl(aclData).principals,
    [aclData]
  )
  const initialAclEntries = React.useMemo(
    () => toAclEntries(initialDraftPrincipals),
    [initialDraftPrincipals]
  )
  const [draftPrincipals, setDraftPrincipals] = React.useState(() =>
    initialDraftPrincipals.map(cloneDraftPrincipal)
  )

  const principalOptions = React.useMemo(
    () => buildPrincipalOptions(users, groups),
    [users, groups]
  )

  const inheritedPrincipals = React.useMemo(
    () => createInheritedPrincipals(aclData.inherited_entries),
    [aclData.inherited_entries]
  )

  const principalMap = React.useMemo(() => {
    const map = new Map<string, PrincipalOption>()
    principalOptions.forEach((o) => map.set(o.id, o))

    const addToMap = (p: {
      principalId: string
      principalType?: "group" | "user"
      principalName?: string | null
      principalExternalId?: string
    }) => {
      if (!map.has(p.principalId)) {
        map.set(p.principalId, {
          id: p.principalId,
          type: p.principalType ?? "user",
          label: p.principalName ?? p.principalExternalId ?? p.principalId,
          description: p.principalExternalId ?? p.principalId,
        })
      }
    }

    draftPrincipals.forEach(addToMap)
    inheritedPrincipals.forEach(addToMap)
    return map
  }, [draftPrincipals, inheritedPrincipals, principalOptions])

  const principalListItems = React.useMemo(() => {
    const inheritedIds = new Set(inheritedPrincipals.map((p) => p.principalId))
    const draftMap = new Map(draftPrincipals.map((p) => [p.principalId, p]))
    const allIds = new Set([...draftMap.keys(), ...inheritedIds])

    return [...allIds]
      .map((id): PrincipalListItem => {
        const draftP = draftMap.get(id)
        const inheritedP = inheritedPrincipals.find((p) => p.principalId === id)
        const type =
          draftP?.principalType ??
          inheritedP?.principalType ??
          principalMap.get(id)?.type

        return {
          principalId: id,
          principalType: type,
          label: principalMap.get(id)?.label ?? id,
          hasDraftEntry: !!draftP,
          hasInheritedPermissions: inheritedIds.has(id),
          immutable: draftP?.immutable ?? inheritedP?.immutable ?? false,
          section: getPrincipalSectionKey({
            hasInheritedPermissions: inheritedIds.has(id),
            principalType:
              type === "user" || type === "group" ? type : undefined,
          }),
        }
      })
      .sort((a, b) => {
        const order: Record<PrincipalListSectionKey, number> = {
          "inherited-groups": 0,
          "inherited-users": 1,
          groups: 2,
          users: 3,
        }
        if (order[a.section] !== order[b.section])
          return order[a.section] - order[b.section]
        return a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        })
      })
  }, [draftPrincipals, inheritedPrincipals, principalMap])

  const principalSections = React.useMemo(() => {
    const sections: Array<{
      key: PrincipalListSectionKey
      label: string
      items: typeof principalListItems
    }> = []

    for (const key of [
      "inherited-groups",
      "inherited-users",
      "groups",
      "users",
    ] as const) {
      const items = principalListItems.filter((item) => item.section === key)
      if (items.length > 0) {
        sections.push({
          key,
          label: principalSectionLabels[key],
          items,
        })
      }
    }

    return sections
  }, [principalListItems])

  const availablePrincipalIds = React.useMemo(() => {
    const assignedIds = new Set(
      principalListItems.map((item) => item.principalId)
    )
    const ids: Array<string> = []

    for (const principal of principalOptions) {
      if (!assignedIds.has(principal.id)) {
        ids.push(principal.id)
      }
    }

    return ids
  }, [principalListItems, principalOptions])

  const handleStartEditing = (principalId: string) => {
    const draftP = draftPrincipals.find((p) => p.principalId === principalId)
    if (draftP) {
      setEditingPrincipal(cloneDraftPrincipal(draftP))
      return
    }

    const option = principalMap.get(principalId)
    if (!option) return

    const inheritedP = inheritedPrincipals.find(
      (p) => p.principalId === principalId
    )
    setEditingPrincipal({
      ...createEmptyPrincipal(option),
      immutable: inheritedP?.immutable,
    })
  }

  const handleAddPrincipals = (selectedIds: Array<string>) => {
    setDraftPrincipals((current) => {
      const existingIds = new Set(current.map((p) => p.principalId))
      const nextPrincipals: Array<DraftPrincipal> = []

      for (const id of selectedIds) {
        if (!existingIds.has(id)) {
          nextPrincipals.push(
            createEmptyPrincipal(principalMap.get(id) ?? null)
          )
        }
      }

      if (nextPrincipals.length === 0) return current
      return [...current, ...nextPrincipals]
    })
  }

  const handleRemovePrincipal = (principalId: string) => {
    setDraftPrincipals((current) =>
      current.filter((p) => p.principalId !== principalId)
    )
    if (editingPrincipal?.principalId === principalId) setEditingPrincipal(null)
  }

  const handleLocalPermissionChange = (bit: number, state: PermissionState) => {
    setEditingPrincipal((current) => {
      if (!current || current.immutable) return current
      return {
        ...current,
        self: setPermissionState(current.self, bit, state),
      }
    })
  }

  const handleSavePermissions = () => {
    if (!editingPrincipal) return

    setDraftPrincipals((current) => {
      const nextPrincipal = cloneDraftPrincipal(editingPrincipal)
      const index = current.findIndex(
        (p) => p.principalId === nextPrincipal.principalId
      )

      if (!hasPrincipalOverrides(nextPrincipal)) {
        return index === -1
          ? current
          : current.filter((_, currentIndex) => currentIndex !== index)
      }

      if (index === -1) return [...current, nextPrincipal]

      return current.map((principal, currentIndex) =>
        currentIndex === index ? nextPrincipal : principal
      )
    })

    setEditingPrincipal(null)
  }

  const handleSubmit = async () => {
    const entries = toAclEntries(draftPrincipals)
    const updatePromise = updateAcl.mutateAsync({ itemId, entries })

    toast.promise(updatePromise, {
      loading: `Updating permissions for ${itemName}...`,
      success: `Permissions updated for ${itemName}`,
      error: formatToastError,
    })

    try {
      await updatePromise
      onOpenChange(false)
    } catch {
      // toast.promise reports the error; keep the draft open for correction.
    }
  }

  const inheritedPrincipalMap = React.useMemo(
    () => new Map(inheritedPrincipals.map((p) => [p.principalId, p])),
    [inheritedPrincipals]
  )
  const permissionGroups = React.useMemo(
    () => getInventoryPermissionDefinitionsByGroup(itemKind),
    [itemKind]
  )
  const hasChanges = React.useMemo(
    () => !aclEntriesEqual(toAclEntries(draftPrincipals), initialAclEntries),
    [draftPrincipals, initialAclEntries]
  )

  return {
    state: {
      availablePrincipalIds,
      editingPrincipal,
      hasChanges,
      inheritedPrincipalMap,
      permissionGroups,
      principalMap,
      principalSections,
      isSaving: updateAcl.isPending,
    },
    actions: {
      handleAddPrincipals,
      handlePermissionChange: handleLocalPermissionChange,
      handleSavePermissions,
      handleRemovePrincipal,
      handleSubmit,
      setEditingPrincipalId: handleStartEditing,
      cancelEditing: () => setEditingPrincipal(null),
    },
  }
}
