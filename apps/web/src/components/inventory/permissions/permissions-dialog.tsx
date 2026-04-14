import React from "react"
import {
  IconChevronDown,
  IconSettings,
  IconUser,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
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

  return (
    <React.Fragment>
      <AddPrincipalsDialog
        availablePrincipalIds={state.availablePrincipalIds}
        disabled={false}
        onAdd={(ids) => {
          actions.handleAddPrincipals(ids)
          setAddDialogOpen(false)
        }}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        principalMap={state.principalMap}
      />

      <div className="-mx-4 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-y px-4 py-6">
        {state.principalSections.length > 0 ? (
          <div className="space-y-6">
            {state.principalSections.map((section) => (
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
                              state.inheritedPrincipalMap.get(item.principalId)
                                ?.sourceItemNames.length
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
                                actions.setEditingPrincipalId(item.principalId)
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
                                actions.handleRemovePrincipal(item.principalId)
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

      <CustomizePermissionsDialog
        editingPrincipal={state.editingPrincipal}
        onClose={actions.cancelEditing}
        onSave={actions.handleSavePermissions}
        onOpenChange={(nextOpen) => !nextOpen && actions.cancelEditing()}
        onPermissionChange={actions.handlePermissionChange}
        permissionGroups={state.permissionGroups}
      />

      <DialogFooter>
        <DialogClose render={<Button variant="outline">Close</Button>} />
        <Button
          onClick={actions.handleSubmit}
          disabled={state.isSaving || !state.hasChanges}
        >
          {state.isSaving ? "Submitting..." : "Submit"}
        </Button>
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
      </DialogContent>
    </Dialog>
  )
}

export const InventoryAclDialog = InventoryPermissionsDialog
