import React from "react"
import {
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconSettings,
  IconSlash,
  IconUser,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field } from "@workspace/ui/components/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import type {
  ApiInheritedInventoryAclEntry,
  ApiInventoryAcl,
  ApiInventoryAclEntry,
  ApiPrincipal,
  ApiTreeNode,
} from "@/lib/queries"
import { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"
import {
  groupsQueryOptions,
  inventoryAclQueryOptions,
  usersQueryOptions,
} from "@/lib/queries"
import { useUpdateInventoryAcl } from "@/hooks/use-inventory-actions"

type InventoryPermissionsDialogProps = {
  itemId: string
  itemKind: ApiTreeNode["kind"]
  itemName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}

type PermissionState = "allow" | "deny" | "inherit"

type PrincipalOption = {
  description: string
  id: string
  label: string
  type: "group" | "user"
}

type DraftScope = {
  allowMask: number
  denyMask: number
}

type DraftPrincipal = {
  immutable?: boolean
  principalExternalId?: string
  principalId: string
  principalName?: string | null
  principalType?: "group" | "user"
  self: DraftScope
}

type DraftAcl = {
  principals: Array<DraftPrincipal>
}

type InheritedPrincipal = {
  immutable?: boolean
  principalExternalId?: string
  principalId: string
  principalName?: string | null
  principalType?: "group" | "user"
  sourceItemNames: Array<string>
}

type PrincipalListSectionKey =
  | "inherited-groups"
  | "inherited-users"
  | "groups"
  | "users"

const principalTypeLabels = {
  group: "Group",
  user: "User",
} as const

const nestedDialogAnimationClassName =
  "top-[calc(50%+1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[nested-dialog-open]:after:absolute data-[nested-dialog-open]:after:inset-0 data-[nested-dialog-open]:after:rounded-[inherit] data-[nested-dialog-open]:after:bg-black/5 data-[starting-style]:scale-90 data-[starting-style]:opacity-0"

function createEmptyScope(): DraftScope {
  return {
    allowMask: 0,
    denyMask: 0,
  }
}

function createEmptyPrincipal(
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

function createDraftAcl(data: ApiInventoryAcl): DraftAcl {
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

function createInheritedPrincipals(
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

function hasScopeOverrides(scope: DraftScope) {
  return scope.allowMask !== 0 || scope.denyMask !== 0
}

function hasPrincipalOverrides(principal: DraftPrincipal) {
  return hasScopeOverrides(principal.self)
}

function normalizeScope(scope: DraftScope): DraftScope {
  return {
    allowMask: scope.allowMask & ~scope.denyMask,
    denyMask: scope.denyMask,
  }
}

function normalizeDraftAcl(draft: DraftAcl | null): DraftAcl | null {
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

function serializeDraftAcl(draft: DraftAcl | null) {
  const normalizedDraft = normalizeDraftAcl(draft)
  if (!normalizedDraft) return ""

  return JSON.stringify({
    principals: normalizedDraft.principals.map((principal) => ({
      principalId: principal.principalId,
      self: principal.self,
    })),
  })
}

function buildPrincipalOptions(
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

function getPrincipalLabel(
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

function getPermissionState(scope: DraftScope, bit: number): PermissionState {
  if ((scope.denyMask & bit) === bit) return "deny"
  if ((scope.allowMask & bit) === bit) return "allow"
  return "inherit"
}

function setPermissionState(
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

function PermissionStateControl({
  onChange,
  value,
}: {
  onChange: (value: PermissionState) => void
  value: PermissionState
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(nextValue) => {
        const state = nextValue[0]
        if (!state) return
        onChange(state as PermissionState)
      }}
      spacing={0}
      variant="outline"
    >
      <ToggleGroupItem
        value="deny"
        aria-label="Deny"
        className="text-destructive!"
      >
        <IconX className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="inherit" aria-label="Inherit">
        <IconSlash className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="allow"
        aria-label="Allow"
        className="text-green-400! dark:text-green-600!"
      >
        <IconCheck className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function getPrincipalSectionKey(params: {
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

function PermissionScopeSection({
  onPermissionChange,
  permissionGroups,
  principal,
}: {
  onPermissionChange: (bit: number, state: PermissionState) => void
  permissionGroups: ReturnType<typeof getInventoryPermissionDefinitionsByGroup>
  principal: DraftPrincipal
}) {
  return (
    <div className="space-y-6">
      {permissionGroups.map((group) => (
        <div key={group.group} className="space-y-3">
          <div className="px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </div>
          <ItemGroup className="gap-3 px-4">
            {group.permissions.map((permission) => (
              <Item key={permission.key} size="sm">
                <ItemContent>
                  <ItemTitle>{permission.label}</ItemTitle>
                  <ItemDescription>{permission.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <PermissionStateControl
                    value={getPermissionState(principal.self, permission.bit)}
                    onChange={(state) =>
                      onPermissionChange(permission.bit, state)
                    }
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </div>
      ))}
    </div>
  )
}

export function InventoryPermissionsDialog({
  itemId,
  itemKind,
  itemName,
  onOpenChange,
  open,
}: InventoryPermissionsDialogProps) {
  const addAnchor = useComboboxAnchor()
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
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [selectedPrincipalIds, setSelectedPrincipalIds] = React.useState<
    Array<string>
  >([])
  const [editingPrincipalId, setEditingPrincipalId] = React.useState<
    string | null
  >(null)

  React.useEffect(() => {
    setDraft(null)
    setInitialSnapshot("")
    setAddDialogOpen(false)
    setSelectedPrincipalIds([])
    setEditingPrincipalId(null)
  }, [itemId, open])

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
      .map((principalId) => {
        const draftPrincipal = draftPrincipalMap.get(principalId)
        const inheritedPrincipal = inheritedPrincipalMap.get(principalId)
        const principalType =
          draftPrincipal?.principalType ??
          inheritedPrincipal?.principalType ??
          principalMap.get(principalId)?.type

        return {
          principalId,
          principalType,
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
            principalType,
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

  function handleAddDialogOpenChange(nextOpen: boolean) {
    setAddDialogOpen(nextOpen)

    if (!nextOpen) {
      setSelectedPrincipalIds([])
    }
  }

  function handleEditDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditingPrincipalId(null)
    }
  }

  function handleAddPrincipals() {
    if (!draft) return
    if (selectedPrincipalIds.length === 0) {
      toast.error("Select at least one principal.")
      return
    }

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

    setSelectedPrincipalIds([])
    setAddDialogOpen(false)
  }

  function handleRemovePrincipal(principalId: string) {
    setDraft((current) => {
      if (!current) return current

      return {
        ...current,
        principals: current.principals.filter(
          (principal) => principal.principalId !== principalId
        ),
      }
    })

    setEditingPrincipalId((current) =>
      current === principalId ? null : current
    )
  }

  function handlePermissionChange(
    principalId: string,
    bit: number,
    state: PermissionState
  ) {
    setDraft((current) => {
      if (!current) return current
      if (
        current.principals.find(
          (principal) => principal.principalId === principalId
        )?.immutable ??
        inheritedPrincipalMap.get(principalId)?.immutable
      ) {
        return current
      }

      const existingIndex = current.principals.findIndex(
        (principal) => principal.principalId === principalId
      )
      const nextPrincipals = current.principals.map((principal) => {
        if (principal.principalId !== principalId) return principal

        return {
          ...principal,
          self: setPermissionState(principal.self, bit, state),
        }
      })

      if (existingIndex === -1) {
        nextPrincipals.push({
          immutable: inheritedPrincipalMap.get(principalId)?.immutable,
          principalId,
          principalType:
            principalMap.get(principalId)?.type ??
            inheritedPrincipalMap.get(principalId)?.principalType,
          principalName:
            principalMap.get(principalId)?.label ??
            inheritedPrincipalMap.get(principalId)?.principalName ??
            null,
          principalExternalId:
            principalMap.get(principalId)?.description ??
            inheritedPrincipalMap.get(principalId)?.principalExternalId,
          self: setPermissionState(createEmptyScope(), bit, state),
        })
      }

      return {
        ...current,
        principals: nextPrincipals.filter(hasPrincipalOverrides),
      }
    })
  }

  async function handleSubmit() {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={nestedDialogAnimationClassName}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Permissions</DialogTitle>
          <DialogDescription>
            Add or remove principals from this item's ACL. Once added, you can
            edit their permissions.
          </DialogDescription>
        </DialogHeader>

        <Dialog open={addDialogOpen} onOpenChange={handleAddDialogOpenChange}>
          <DialogTrigger
            render={<Button variant="secondary" disabled={loading} />}
          >
            <IconPlus />
            Add Principals
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            showOverlay={false}
            className={nestedDialogAnimationClassName}
          >
            <DialogHeader>
              <DialogTitle>Add Principals</DialogTitle>
              <DialogDescription>
                Select one or more users or groups to configure permissions for
                this item.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <Combobox
                multiple
                items={availablePrincipalIds}
                value={selectedPrincipalIds}
                onValueChange={(value) => setSelectedPrincipalIds(value)}
              >
                <ComboboxChips ref={addAnchor} className="w-full">
                  <ComboboxValue>
                    {(values: Array<string>) => (
                      <React.Fragment>
                        {values.map((principalId) => {
                          const principal = principalMap.get(principalId)

                          return (
                            <ComboboxChip key={principalId}>
                              {principal?.label}
                            </ComboboxChip>
                          )
                        })}
                        <ComboboxChipsInput placeholder="Search principals..." />
                      </React.Fragment>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={addAnchor}>
                  <ComboboxEmpty>No principals found.</ComboboxEmpty>
                  <ComboboxList>
                    {(principalId) => {
                      const principal = principalMap.get(principalId as string)
                      if (!principal) return null

                      return (
                        <ComboboxItem key={principal.id} value={principal.id}>
                          <Item size="xs" className="p-0">
                            <ItemContent>
                              <ItemTitle className="whitespace-nowrap">
                                {principal.label}
                              </ItemTitle>
                              <ItemDescription>
                                {principalTypeLabels[principal.type]}
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                        </ComboboxItem>
                      )
                    }}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Close</Button>} />
              <Button
                onClick={handleAddPrincipals}
                disabled={selectedPrincipalIds.length === 0}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="-mx-4 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-y px-4 py-6">
          {loadError ? (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>Failed to Load ACL</ItemTitle>
                <ItemDescription>
                  {loadError instanceof Error
                    ? loadError.message
                    : "Could not load principals or ACL entries."}
                </ItemDescription>
              </ItemContent>
            </Item>
          ) : loading ? (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>Loading ACL</ItemTitle>
                <ItemDescription>
                  Fetching principals and current permissions.
                </ItemDescription>
              </ItemContent>
            </Item>
          ) : principalListItems.length > 0 ? (
            <div className="space-y-6">
              {principalSections.map((section) => (
                <Collapsible key={section.key} defaultOpen={true}>
                  <div className="space-y-2">
                    <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-center justify-between rounded-2xl px-1 py-1 text-left">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {section.label}
                        </span>
                        <Badge variant="outline">{section.items.length}</Badge>
                      </span>
                      <IconChevronDown className="size-4 transition-transform group-data-panel-open/collapsible-trigger:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <ItemGroup>
                        {section.items.map((item) => {
                          const inheritedPrincipal = inheritedPrincipalMap.get(
                            item.principalId
                          )
                          const fallbackPrincipal: DraftPrincipal = {
                            immutable: inheritedPrincipal?.immutable,
                            principalId: item.principalId,
                            principalType:
                              principalMap.get(item.principalId)?.type ??
                              inheritedPrincipal?.principalType,
                            principalName:
                              principalMap.get(item.principalId)?.label ??
                              inheritedPrincipal?.principalName ??
                              null,
                            principalExternalId:
                              principalMap.get(item.principalId)?.description ??
                              inheritedPrincipal?.principalExternalId,
                            self: createEmptyScope(),
                          }
                          const displayPrincipal =
                            draftPrincipalMap.get(item.principalId) ??
                            fallbackPrincipal
                          const label = getPrincipalLabel(
                            displayPrincipal,
                            principalMap
                          )

                          return (
                            <Item key={item.principalId} variant="muted">
                              <ItemMedia variant="icon">
                                {displayPrincipal.principalType === "group" ? (
                                  <IconUsersGroup />
                                ) : (
                                  <IconUser />
                                )}
                              </ItemMedia>
                              <ItemContent>
                                <ItemTitle>{label}</ItemTitle>
                                <ItemDescription>
                                  {displayPrincipal.principalType
                                    ? principalTypeLabels[
                                        displayPrincipal.principalType
                                      ]
                                    : "Principal"}
                                  {item.hasInheritedPermissions &&
                                  inheritedPrincipal?.sourceItemNames.length
                                    ? ` · Inherited from ${inheritedPrincipal.sourceItemNames.join(", ")}`
                                    : ""}
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={item.immutable}
                                  onClick={() =>
                                    setEditingPrincipalId(item.principalId)
                                  }
                                >
                                  <IconSettings />
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="icon-xs"
                                  disabled={
                                    item.immutable || !item.hasDraftEntry
                                  }
                                  onClick={() =>
                                    handleRemovePrincipal(item.principalId)
                                  }
                                >
                                  <IconX />
                                </Button>
                              </ItemActions>
                            </Item>
                          )
                        })}
                      </ItemGroup>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ) : (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>No Principals Configured</ItemTitle>
                <ItemDescription>
                  Add a user or group to configure permissions for this item.
                </ItemDescription>
              </ItemContent>
            </Item>
          )}
        </div>

        <Dialog
          open={editingPrincipal !== null}
          onOpenChange={handleEditDialogOpenChange}
        >
          <DialogContent
            showCloseButton={false}
            showOverlay={false}
            className={nestedDialogAnimationClassName}
          >
            <DialogHeader>
              <DialogTitle>Customize Permissions</DialogTitle>
              <DialogDescription>
                Update permissions for{" "}
                {editingPrincipal?.principalName || "this principal"}.
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-4 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-y py-6">
              {editingPrincipal ? (
                <React.Fragment>
                  <PermissionScopeSection
                    onPermissionChange={(bit, state) =>
                      handlePermissionChange(
                        editingPrincipal.principalId,
                        bit,
                        state
                      )
                    }
                    permissionGroups={permissionGroups}
                    principal={editingPrincipal}
                  />
                </React.Fragment>
              ) : null}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Close</Button>} />
              <Button
                onClick={() => setEditingPrincipalId(null)}
                disabled={editingPrincipal?.immutable}
              >
                {editingPrincipal?.immutable ? "Protected" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Close</Button>} />
          <Button
            onClick={handleSubmit}
            disabled={loading || updateAcl.isPending || !hasChanges}
          >
            {updateAcl.isPending ? "Saving..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const InventoryAclDialog = InventoryPermissionsDialog
