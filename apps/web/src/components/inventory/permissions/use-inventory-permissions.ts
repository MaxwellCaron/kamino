import React from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  buildPrincipalOptions,
  createDraftAcl,
  createEmptyPrincipal,
  createEmptyScope,
  createInheritedPrincipals,
  getPrincipalSectionKey,
  hasPrincipalOverrides,
  normalizeDraftAcl,
  serializeDraftAcl,
  setPermissionState,
} from "./acl-transformers"
import type {
  DraftAcl,
  PermissionState,
  PrincipalListItem,
  PrincipalListSectionKey,
  PrincipalOption,
} from "./types"
import type { ApiTreeNode } from "@/lib/queries"
import { useUpdateInventoryAcl } from "@/hooks/use-inventory-actions"
import { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"
import {
  groupsQueryOptions,
  inventoryAclQueryOptions,
  usersQueryOptions,
} from "@/lib/queries"

export function useInventoryPermissions({
  itemId,
  itemKind,
  itemName,
  onOpenChange,
  open,
}: {
  itemId: string
  itemKind: ApiTreeNode["kind"]
  itemName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const aclQuery = useQuery({
    ...inventoryAclQueryOptions(itemId),
    enabled: open && !!itemId,
  })
  const usersQuery = useQuery({
    ...usersQueryOptions,
    enabled: open,
  })
  const groupsQuery = useQuery({
    ...groupsQueryOptions,
    enabled: open,
  })
  const updateAcl = useUpdateInventoryAcl()

  const [draft, setDraft] = React.useState<DraftAcl | null>(null)
  const [initialSnapshot, setInitialSnapshot] = React.useState("")
  const [editingPrincipalId, setEditingPrincipalId] = React.useState<
    string | null
  >(null)

  // Reset state when dialog opens/closes or itemId changes
  React.useEffect(() => {
    if (!open) {
      setDraft(null)
      setInitialSnapshot("")
      setEditingPrincipalId(null)
    }
  }, [itemId, open])

  // Initialize draft from query data
  React.useEffect(() => {
    if (!open || !aclQuery.data || draft !== null) return

    const nextDraft = createDraftAcl(aclQuery.data)
    setDraft(nextDraft)
    setInitialSnapshot(serializeDraftAcl(nextDraft))
  }, [aclQuery.data, draft, open])

  const principalOptions = React.useMemo(
    () => buildPrincipalOptions(usersQuery.data ?? [], groupsQuery.data ?? []),
    [groupsQuery.data, usersQuery.data]
  )

  const inheritedPrincipals = React.useMemo(
    () => createInheritedPrincipals(aclQuery.data?.inherited_entries ?? []),
    [aclQuery.data?.inherited_entries]
  )

  const inheritedPrincipalMap = React.useMemo(
    () =>
      new Map(
        inheritedPrincipals.map((principal) => [
          principal.principalId,
          principal,
        ])
      ),
    [inheritedPrincipals]
  )

  const draftPrincipalMap = React.useMemo(
    () =>
      new Map(
        (draft?.principals ?? []).map((principal) => [
          principal.principalId,
          principal,
        ])
      ),
    [draft?.principals]
  )

  const principalMap = React.useMemo(() => {
    const map = new Map<string, PrincipalOption>()

    for (const option of principalOptions) {
      map.set(option.id, option)
    }

    for (const principal of draft?.principals ?? []) {
      if (!map.has(principal.principalId)) {
        map.set(principal.principalId, {
          id: principal.principalId,
          type: principal.principalType ?? "user",
          label:
            principal.principalName ??
            principal.principalExternalId ??
            principal.principalId,
          description: principal.principalExternalId ?? principal.principalId,
        })
      }
    }

    for (const principal of inheritedPrincipals) {
      if (!map.has(principal.principalId)) {
        map.set(principal.principalId, {
          id: principal.principalId,
          type: principal.principalType ?? "user",
          label:
            principal.principalName ??
            principal.principalExternalId ??
            principal.principalId,
          description: principal.principalExternalId ?? principal.principalId,
        })
      }
    }

    return map
  }, [draft?.principals, inheritedPrincipals, principalOptions])

  const principalListItems = React.useMemo(() => {
    const inheritedIds = new Set(
      inheritedPrincipals.map((principal) => principal.principalId)
    )
    const ids = new Set([...draftPrincipalMap.keys(), ...inheritedIds])

    return [...ids]
      .map((principalId): PrincipalListItem => {
        const draftPrincipal = draftPrincipalMap.get(principalId)
        const inheritedPrincipal = inheritedPrincipalMap.get(principalId)
        const principalType =
          draftPrincipal?.principalType ??
          inheritedPrincipal?.principalType ??
          principalMap.get(principalId)?.type

        return {
          principalId,
          principalType,
          label: principalMap.get(principalId)?.label ?? principalId,
          hasDraftEntry: draftPrincipalMap.has(principalId),
          hasOverrides: hasPrincipalOverrides(
            draftPrincipal ?? {
              principalType,
              immutable: inheritedPrincipal?.immutable,
              principalName:
                principalMap.get(principalId)?.label ??
                inheritedPrincipal?.principalName,
              principalExternalId:
                principalMap.get(principalId)?.description ??
                inheritedPrincipal?.principalExternalId,
              principalId,
              self: createEmptyScope(),
            }
          ),
          hasInheritedPermissions: inheritedIds.has(principalId),
          immutable:
            draftPrincipal?.immutable ?? inheritedPrincipal?.immutable ?? false,
          section: getPrincipalSectionKey({
            hasInheritedPermissions: inheritedIds.has(principalId),
            principalType:
              principalType === "user" || principalType === "group"
                ? principalType
                : undefined,
          }),
        }
      })
      .sort((left, right) => {
        const sectionOrder: Record<PrincipalListSectionKey, number> = {
          "inherited-groups": 0,
          "inherited-users": 1,
          groups: 2,
          users: 3,
        }
        if (sectionOrder[left.section] !== sectionOrder[right.section]) {
          return sectionOrder[left.section] - sectionOrder[right.section]
        }

        const leftLabel =
          principalMap.get(left.principalId)?.label ?? left.principalId
        const rightLabel =
          principalMap.get(right.principalId)?.label ?? right.principalId

        return leftLabel.localeCompare(rightLabel, undefined, {
          sensitivity: "base",
        })
      })
  }, [
    draftPrincipalMap,
    inheritedPrincipalMap,
    inheritedPrincipals,
    principalMap,
  ])

  const principalSections = React.useMemo(
    () =>
      [
        {
          key: "inherited-groups" as const,
          label: "Inherited Groups",
          items: principalListItems.filter(
            (item) => item.section === "inherited-groups"
          ),
        },
        {
          key: "inherited-users" as const,
          label: "Inherited Users",
          items: principalListItems.filter(
            (item) => item.section === "inherited-users"
          ),
        },
        {
          key: "groups" as const,
          label: "Groups",
          items: principalListItems.filter((item) => item.section === "groups"),
        },
        {
          key: "users" as const,
          label: "Users",
          items: principalListItems.filter((item) => item.section === "users"),
        },
      ].filter((section) => section.items.length > 0),
    [principalListItems]
  )

  const availablePrincipalIds = React.useMemo(() => {
    const currentIds = new Set(
      principalListItems.map((item) => item.principalId)
    )

    return principalOptions
      .filter((principal) => !currentIds.has(principal.id))
      .map((principal) => principal.id)
  }, [principalListItems, principalOptions])

  const editingPrincipal = React.useMemo(() => {
    if (!editingPrincipalId) return null

    const draftPrincipal =
      draft?.principals.find(
        (principal) => principal.principalId === editingPrincipalId
      ) ?? null
    if (draftPrincipal) return draftPrincipal

    const principal = principalMap.get(editingPrincipalId)
    const inheritedPrincipal = inheritedPrincipalMap.get(editingPrincipalId)

    return {
      immutable: inheritedPrincipal?.immutable,
      principalId: editingPrincipalId,
      principalType: principal?.type ?? inheritedPrincipal?.principalType,
      principalName:
        principal?.label ?? inheritedPrincipal?.principalName ?? null,
      principalExternalId:
        principal?.description ?? inheritedPrincipal?.principalExternalId,
      self: createEmptyScope(),
    }
  }, [
    draft?.principals,
    editingPrincipalId,
    inheritedPrincipalMap,
    principalMap,
  ])

  const permissionGroups = React.useMemo(
    () => getInventoryPermissionDefinitionsByGroup(itemKind),
    [itemKind]
  )

  const hasChanges = React.useMemo(
    () => serializeDraftAcl(draft) !== initialSnapshot,
    [draft, initialSnapshot]
  )

  const loading =
    open &&
    (aclQuery.isLoading ||
      usersQuery.isLoading ||
      groupsQuery.isLoading ||
      draft === null)

  const loadError =
    aclQuery.error ?? usersQuery.error ?? groupsQuery.error ?? null

  const handleAddPrincipals = (selectedPrincipalIds: Array<string>) => {
    if (!draft) return

    setDraft((current) => {
      if (!current) return current

      const existingIds = new Set(
        current.principals.map((principal) => principal.principalId)
      )

      const nextPrincipals = selectedPrincipalIds
        .filter((principalId) => !existingIds.has(principalId))
        .map((principalId) =>
          createEmptyPrincipal(principalMap.get(principalId) ?? null)
        )

      return {
        ...current,
        principals: [...current.principals, ...nextPrincipals],
      }
    })
  }

  const handleRemovePrincipal = (principalId: string) => {
    setDraft((current) => {
      if (!current) return current

      return {
        ...current,
        principals: current.principals.filter(
          (principal) => principal.principalId !== principalId
        ),
      }
    })

    if (editingPrincipalId === principalId) {
      setEditingPrincipalId(null)
    }
  }

  const handlePermissionChange = (
    principalId: string,
    bit: number,
    state: PermissionState
  ) => {
    setDraft((current) => {
      if (!current) return current
      if (
        current.principals.find((p) => p.principalId === principalId)
          ?.immutable ??
        inheritedPrincipalMap.get(principalId)?.immutable
      ) {
        return current
      }

      const existingIndex = current.principals.findIndex(
        (p) => p.principalId === principalId
      )
      const nextPrincipals = current.principals.map((p) => {
        if (p.principalId !== principalId) return p

        return {
          ...p,
          self: setPermissionState(p.self, bit, state),
        }
      })

      if (existingIndex === -1) {
        const inheritedPrincipal = inheritedPrincipalMap.get(principalId)
        const principal = principalMap.get(principalId)

        nextPrincipals.push({
          immutable: inheritedPrincipal?.immutable,
          principalId,
          principalType: principal?.type ?? inheritedPrincipal?.principalType,
          principalName:
            principal?.label ?? inheritedPrincipal?.principalName ?? null,
          principalExternalId:
            principal?.description ?? inheritedPrincipal?.principalExternalId,
          self: setPermissionState(createEmptyScope(), bit, state),
        })
      }

      return {
        ...current,
        principals: nextPrincipals.filter(hasPrincipalOverrides),
      }
    })
  }

  const handleSubmit = async () => {
    const normalizedDraft = normalizeDraftAcl(draft)
    if (!normalizedDraft) return

    const entries: Array<{
      applies_to_children: boolean
      applies_to_self: boolean
      effect: "allow" | "deny"
      inherited_only: boolean
      permissions: number
      principal_id: string
    }> = []

    for (const principal of normalizedDraft.principals) {
      if (principal.self.allowMask > 0) {
        entries.push({
          principal_id: principal.principalId,
          effect: "allow",
          permissions: principal.self.allowMask,
          applies_to_self: true,
          applies_to_children: itemKind === "folder",
          inherited_only: false,
        })
      }

      if (principal.self.denyMask > 0) {
        entries.push({
          principal_id: principal.principalId,
          effect: "deny",
          permissions: principal.self.denyMask,
          applies_to_self: true,
          applies_to_children: itemKind === "folder",
          inherited_only: false,
        })
      }
    }

    try {
      await updateAcl.mutateAsync({
        itemId,
        entries,
      })
      toast.success(`Permissions updated for ${itemName}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update permissions"
      )
    }
  }

  return {
    state: {
      availablePrincipalIds,
      editingPrincipal,
      hasChanges,
      inheritedPrincipalMap,
      loadError,
      loading,
      permissionGroups,
      principalMap,
      principalSections,
      isSaving: updateAcl.isPending,
    },
    actions: {
      handleAddPrincipals,
      handlePermissionChange,
      handleRemovePrincipal,
      handleSubmit,
      setEditingPrincipalId,
    },
  }
}
