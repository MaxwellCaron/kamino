import React from "react"
import {
  IconChevronDown,
  IconLock,
  IconSearch,
  IconSettings,
  IconUser,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Button } from "@workspace/ui/components/button"
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { AddPrincipalsDialog } from "./add-principals-dialog"
import {
  nestedDialogAnimationClassName,
  principalTypeLabels,
} from "./constants"
import { CustomizePermissionsDialog } from "./customize-permissions-dialog"
import { useInventoryPermissions } from "./use-inventory-permissions"
import type { InventoryPermissionsDialogProps } from "./types"
import type { ApiInventoryAcl, ApiPrincipal } from "@/lib/queries"
import {
  groupsQueryOptions,
  inventoryAclQueryOptions,
  usersQueryOptions,
} from "@/lib/queries"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { formatVmReference } from "@/lib/utils"

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

  React.useEffect(() => {
    if (!props.open) {
      setPrincipalSearch("")
    }
  }, [props.open])

  const normalizedPrincipalSearch = principalSearch.trim().toLocaleLowerCase()

  const filteredPrincipalSections = React.useMemo(() => {
    if (normalizedPrincipalSearch === "") {
      return state.principalSections
    }

    return state.principalSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const inheritedSourceNames =
            state.inheritedPrincipalMap.get(item.principalId)
              ?.sourceItemNames ?? []

          return [
            item.label,
            item.principalId,
            item.principalType ? principalTypeLabels[item.principalType] : "",
            ...inheritedSourceNames,
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedPrincipalSearch)
          )
        }),
      }))
      .filter((section) => section.items.length > 0)
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
        <InputGroup>
          <InputGroupInput
            placeholder="Search principals..."
            value={principalSearch}
            onChange={(event) => setPrincipalSearch(event.target.value)}
            aria-label="Search added principals"
          />
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {filteredPrincipalCount}{" "}
            {filteredPrincipalCount === 1 ? "result" : "results"}
          </InputGroupAddon>
        </InputGroup>
        <AddPrincipalsDialog
          availablePrincipalIds={state.availablePrincipalIds}
          disabled={false}
          itemName={props.itemName}
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
                      <IconChevronDown className="size-4 transition-transform group-data-panel-open/collapsible-trigger:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <ItemGroup>
                        {section.items.map((item) => (
                          <Item key={item.principalId} variant="muted">
                            <ItemMedia variant="icon">
                              {item.principalType === "group" ? (
                                <IconUsersGroup />
                              ) : (
                                <IconUser />
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
                                disabled={item.immutable}
                                onClick={() =>
                                  actions.setEditingPrincipalId(
                                    item.principalId
                                  )
                                }
                              >
                                <IconSettings />
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon-xs"
                                disabled={item.immutable || !item.hasDraftEntry}
                                onClick={() =>
                                  actions.handleRemovePrincipal(
                                    item.principalId
                                  )
                                }
                              >
                                <IconX />
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
                  <IconSearch />
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
                <IconUsersGroup />
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
        editingPrincipal={state.editingPrincipal}
        onSave={actions.handleSavePermissions}
        onOpenChange={(nextOpen) => !nextOpen && actions.cancelEditing()}
        onPermissionChange={actions.handlePermissionChange}
        permissionGroups={state.permissionGroups}
      />

      <DialogFooter className="mt-0">
        <AppDialogPrimaryButton
          onClick={actions.handleSubmit}
          disabled={state.isSaving || !state.hasChanges}
        >
          {state.isSaving ? "Submitting..." : "Submit"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </React.Fragment>
  )
}

export function InventoryPermissionsDialog(
  props: InventoryPermissionsDialogProps
) {
  const { itemId, onOpenChange, open } = props

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

  const loading =
    aclQuery.isLoading || usersQuery.isLoading || groupsQuery.isLoading
  const loadError = aclQuery.error ?? usersQuery.error ?? groupsQuery.error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        icon={IconLock}
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
            <p>Once added, you can edit their permissions.</p>
          </>
        }
        descriptionProps={{ render: <div /> }}
        className={nestedDialogAnimationClassName}
      >
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
        ) : loading || !aclQuery.data ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Loading ACL</ItemTitle>
              <ItemDescription>
                Fetching principals and current permissions.
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : (
          <InventoryPermissionsFormBody
            key={`${itemId}-${open}`}
            props={props}
            aclData={aclQuery.data}
            users={usersQuery.data ?? []}
            groups={groupsQuery.data ?? []}
          />
        )}
      </AppDialogContent>
    </Dialog>
  )
}

export const InventoryAclDialog = InventoryPermissionsDialog
