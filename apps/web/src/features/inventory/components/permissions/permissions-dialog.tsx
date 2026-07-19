import React from "react"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  ChevronDownIcon,
  LockedIcon,
  Search01Icon,
  Settings01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import { inventoryAclQueryOptions } from "../../api/inventory-api"
import { useInventoryPermissions } from "../../hooks/use-inventory-permissions"
import { principalTypeLabels } from "../../utils/constants"
import { AddPrincipalsDialog } from "./add-principals-popup"
import { CustomizePermissionsDialog } from "./customize-permissions-dialog"
import type {
  ApiInventoryAcl,
  InventoryPermissionsDialogProps,
} from "../../types/inventory-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { SearchInputGroup } from "@/components/forms/search-input-group"
import { formatVmReference } from "@/features/shared/utils/format"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import { PreloadOverlay } from "@/components/loading-overlay"

function InventoryPermissionsFormBody({
  props,
  aclData,
  users,
  groups,
}: {
  props: InventoryPermissionsDialogProps
  aclData: ApiInventoryAcl
  users: Array<ApiPrincipal>
  groups: Array<ApiPrincipal>
}) {
  const { state, actions } = useInventoryPermissions({
    ...props,
    aclData,
    users,
    groups,
  })
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [principalSearch, setPrincipalSearch] = React.useState("")

  const normalizedPrincipalSearch = principalSearch.trim().toLocaleLowerCase()

  const filteredPrincipalSections = React.useMemo(() => {
    if (normalizedPrincipalSearch === "") {
      return state.principalSections
    }

    return state.principalSections.flatMap((section) => {
      const items = section.items.filter((item) => {
        const inheritedSourceNames =
          state.inheritedPrincipalMap.get(item.principalId)?.sourceItemNames ??
          []

        return [
          item.label,
          item.principalId,
          item.principalType ? principalTypeLabels[item.principalType] : "",
          ...inheritedSourceNames,
        ].some((value) =>
          value.toLocaleLowerCase().includes(normalizedPrincipalSearch)
        )
      })

      return items.length > 0
        ? [
            {
              ...section,
              items,
            },
          ]
        : []
    })
  }, [
    normalizedPrincipalSearch,
    state.inheritedPrincipalMap,
    state.principalSections,
  ])

  const filteredPrincipalCount = React.useMemo(
    () =>
      filteredPrincipalSections.reduce(
        (count, section) => count + section.items.length,
        0
      ),
    [filteredPrincipalSections]
  )
  const hasConfiguredPrincipals = state.principalSections.length > 0
  const hasVisiblePrincipals = filteredPrincipalSections.length > 0

  return (
    <React.Fragment>
      <div className="flex justify-between gap-2">
        <SearchInputGroup
          value={principalSearch}
          onValueChange={setPrincipalSearch}
          placeholder="Search principals..."
          aria-label="Search added principals"
          resultCount={filteredPrincipalCount}
        />
        <AddPrincipalsDialog
          availablePrincipalIds={state.availablePrincipalIds}
          disabled={state.isSaving}
          onAdd={(ids) => {
            actions.handleAddPrincipals(ids)
            setAddDialogOpen(false)
          }}
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          principalMap={state.principalMap}
        />
      </div>

      <AppDialogScrollBody className="-mb-6">
        {hasConfiguredPrincipals ? (
          hasVisiblePrincipals ? (
            <div className="flex flex-col gap-6">
              {filteredPrincipalSections.map((section) => (
                <Collapsible key={section.key} defaultOpen={true}>
                  <div className="flex flex-col gap-2">
                    <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-center justify-between rounded-2xl px-1 py-1 text-left">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {section.label}
                        </span>
                        <Badge variant="outline">{section.items.length}</Badge>
                      </span>
                      <HugeiconsIcon
                        icon={ChevronDownIcon}
                        className="size-4 transition-transform group-data-panel-open/collapsible-trigger:rotate-180"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <ItemGroup>
                        {section.items.map((item) => (
                          <Item key={item.principalId} variant="muted">
                            <ItemMedia variant="icon">
                              {item.principalType === "group" ? (
                                <HugeiconsIcon icon={UserGroupIcon} />
                              ) : (
                                <HugeiconsIcon icon={UserIcon} />
                              )}
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>{item.label}</ItemTitle>
                              <ItemDescription>
                                {item.principalType
                                  ? principalTypeLabels[item.principalType]
                                  : "Principal"}
                                {item.hasInheritedPermissions &&
                                state.inheritedPrincipalMap.get(
                                  item.principalId
                                )?.sourceItemNames.length
                                  ? ` · Inherited from ${state.inheritedPrincipalMap
                                      .get(item.principalId)
                                      ?.sourceItemNames.join(", ")}`
                                  : ""}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={state.isSaving || item.immutable}
                                type="button"
                                onClick={() =>
                                  actions.setEditingPrincipalId(
                                    item.principalId
                                  )
                                }
                              >
                                <HugeiconsIcon
                                  icon={Settings01Icon}
                                  data-icon="inline-start"
                                />
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon-xs"
                                disabled={
                                  state.isSaving ||
                                  item.immutable ||
                                  !item.hasDraftEntry
                                }
                                type="button"
                                aria-label={`Remove ${item.label}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  actions.handleRemovePrincipal(
                                    item.principalId
                                  )
                                }}
                              >
                                <HugeiconsIcon icon={Cancel01Icon} />
                              </Button>
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    className="text-muted-foreground"
                  />
                </EmptyMedia>
                <EmptyTitle>No Matching Principals</EmptyTitle>
                <EmptyDescription>
                  No added principals match your search.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={UserGroupIcon}
                  className="text-muted-foreground"
                />
              </EmptyMedia>
              <EmptyTitle>No Principals Configured</EmptyTitle>
              <EmptyDescription>
                Add a user or group to configure permissions for this item.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </AppDialogScrollBody>

      <CustomizePermissionsDialog
        key={state.editingPrincipal?.principalId ?? "closed"}
        editingPrincipal={state.editingPrincipal}
        onSave={actions.handleSavePermissions}
        onOpenChange={(nextOpen) => !nextOpen && actions.cancelEditing()}
        onPermissionChange={actions.handlePermissionChange}
        permissionGroups={state.permissionGroups}
      />

      <DialogFooter className="mt-0">
        <AppDialogPrimaryButton
          type="button"
          onClick={() => void actions.handleSubmit()}
          disabled={!state.hasChanges}
          pending={state.isSaving}
        >
          Submit
        </AppDialogPrimaryButton>
      </DialogFooter>
    </React.Fragment>
  )
}

export function InventoryPermissionsDialog(
  props: InventoryPermissionsDialogProps
) {
  const { itemId, onOpenChange, open } = props

  const {
    data: acl,
    error: aclError,
    isFetchedAfterMount: isAclFetchedAfterMount,
    isFetching: isAclFetching,
    isLoading: isAclLoading,
  } = useQuery({
    ...inventoryAclQueryOptions(itemId),
    enabled: open && !!itemId,
  })
  const {
    data: users,
    error: usersError,
    isLoading: isUsersLoading,
  } = useQuery({
    ...usersQueryOptions,
    enabled: open,
  })
  const {
    data: groups,
    error: groupsError,
    isLoading: isGroupsLoading,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: open,
  })

  const waitingForFreshAcl = isAclFetching && !isAclFetchedAfterMount
  const loading =
    isAclLoading || waitingForFreshAcl || isUsersLoading || isGroupsLoading
  const loadError = aclError ?? usersError ?? groupsError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={LockedIcon}
        title="Permissions"
        description={
          <>
            <p>
              {props.itemKind === "vm"
                ? `Add or remove principals from ${formatVmReference(
                    props.itemVmid,
                    props.itemName
                  )}.`
                : `Add or remove principals from the ${props.itemKind} "${props.itemName}".`}
            </p>
          </>
        }
        descriptionProps={{ render: <div /> }}
        className={nestedDialogAnimationClassName}
      >
        {loading ? (
          <div className="relative min-h-66">
            <PreloadOverlay active={loading} label="Loading permissions" />
          </div>
        ) : loadError || !acl ? (
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
        ) : (
          <InventoryPermissionsFormBody
            key={`${itemId}-${open}`}
            props={props}
            aclData={acl}
            users={users ?? []}
            groups={groups ?? []}
          />
        )}
      </AppDialogContent>
    </Dialog>
  )
}

export const InventoryAclDialog = InventoryPermissionsDialog
