import React from "react"
import { useForm } from "@tanstack/react-form"
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
} from "./acl-transformers"
import type {
  DraftPrincipal,
  PermissionState,
  PrincipalListItem,
  PrincipalListSectionKey,
  PrincipalOption,
} from "./types"
import type { ApiInventoryAcl, ApiPrincipal, ApiTreeNode } from "@/lib/queries"
import { useUpdateInventoryAcl } from "@/hooks/use-inventory-actions"
import { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"

type AclEntry = {
  applies_to_children: boolean
  applies_to_self: boolean
  effect: "allow" | "deny"
  inherited_only: boolean
  permissions: number
  principal_id: string
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

  // This state now holds the "draft" of the principal currently being edited in the nested dialog
  const [editingPrincipal, setEditingPrincipal] =
    React.useState<DraftPrincipal | null>(null)

  const form = useForm({
    defaultValues: {
      principals: createDraftAcl(aclData).principals,
    },
    onSubmit: async ({ value }) => {
      const entries: Array<AclEntry> = []

      for (const principal of value.principals) {
        const scope = normalizeScope(principal.self)
        if (scope.allowMask > 0) {
          entries.push({
            principal_id: principal.principalId,
            effect: "allow",
            permissions: scope.allowMask,
            applies_to_self: true,
            applies_to_children: itemKind === "folder",
            inherited_only: false,
          })
        }
        if (scope.denyMask > 0) {
          entries.push({
            principal_id: principal.principalId,
            effect: "deny",
            permissions: scope.denyMask,
            applies_to_self: true,
            applies_to_children: itemKind === "folder",
            inherited_only: false,
          })
        }
      }

      try {
        await updateAcl.mutateAsync({ itemId, entries })
        toast.success(`Permissions updated for ${itemName}`)
        onOpenChange(false)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update permissions"
        )
      }
    },
  })

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

    form.state.values.principals.forEach(addToMap)
    inheritedPrincipals.forEach(addToMap)
    return map
  }, [form.state.values.principals, inheritedPrincipals, principalOptions])

  const principalListItems = React.useMemo(() => {
    const inheritedIds = new Set(inheritedPrincipals.map((p) => p.principalId))
    const draftPrincipals = form.state.values.principals
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
          hasOverrides: draftP ? hasPrincipalOverrides(draftP) : false,
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
  }, [form.state.values.principals, inheritedPrincipals, principalMap])

  const principalSections = React.useMemo(
    () =>
      (["inherited-groups", "inherited-users", "groups", "users"] as const)
        .map((key) => ({
          key,
          label: key
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          items: principalListItems.filter((item) => item.section === key),
        }))
        .filter((s) => s.items.length > 0),
    [principalListItems]
  )

  const availablePrincipalIds = React.useMemo(
    () =>
      principalOptions
        .filter(
          (p) => !principalListItems.some((item) => item.principalId === p.id)
        )
        .map((p) => p.id),
    [principalListItems, principalOptions]
  )

  const handleStartEditing = (principalId: string) => {
    // 1. Check if already in draft
    const draftP = form.state.values.principals.find(
      (p) => p.principalId === principalId
    )
    if (draftP) {
      setEditingPrincipal({ ...draftP }) // Clone to allow canceling
      return
    }

    // 2. Otherwise create from principalMap + inherited status
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
    const existingIds = new Set(
      form.state.values.principals.map((p) => p.principalId)
    )
    selectedIds
      .filter((id) => !existingIds.has(id))
      .forEach((id) => {
        form.pushFieldValue(
          "principals",
          createEmptyPrincipal(principalMap.get(id) ?? null)
        )
      })
  }

  const handleRemovePrincipal = (principalId: string) => {
    const index = form.state.values.principals.findIndex(
      (p) => p.principalId === principalId
    )
    if (index !== -1) form.removeFieldValue("principals", index)
    if (editingPrincipal?.principalId === principalId) setEditingPrincipal(null)
  }

  // Updates the BUFFER state, not the form
  const handleLocalPermissionChange = (bit: number, state: PermissionState) => {
    if (!editingPrincipal || editingPrincipal.immutable) return
    setEditingPrincipal({
      ...editingPrincipal,
      self: setPermissionState(editingPrincipal.self, bit, state),
    })
  }

  // Commits buffered changes to the main form
  const handleSavePermissions = () => {
    if (!editingPrincipal) return

    const index = form.state.values.principals.findIndex(
      (p) => p.principalId === editingPrincipal.principalId
    )

    if (index !== -1) {
      form.setFieldValue(`principals[${index}]`, editingPrincipal)
    } else {
      // If it wasn't in draft yet
      if (hasPrincipalOverrides(editingPrincipal)) {
        form.pushFieldValue("principals", editingPrincipal)
      }
    }

    setEditingPrincipal(null)
  }

  return {
    state: {
      availablePrincipalIds,
      editingPrincipal,
      hasChanges: form.state.isDirty,
      inheritedPrincipalMap: new Map(
        inheritedPrincipals.map((p) => [p.principalId, p])
      ),
      permissionGroups: React.useMemo(
        () => getInventoryPermissionDefinitionsByGroup(itemKind),
        [itemKind]
      ),
      principalMap,
      principalSections,
      isSaving: updateAcl.isPending,
    },
    actions: {
      handleAddPrincipals,
      handlePermissionChange: handleLocalPermissionChange,
      handleSavePermissions,
      handleRemovePrincipal,
      handleSubmit: form.handleSubmit,
      setEditingPrincipalId: handleStartEditing,
      cancelEditing: () => setEditingPrincipal(null),
    },
  }
}
