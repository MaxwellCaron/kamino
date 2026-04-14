import React from "react"
import {
  IconChevronDown,
  IconSettings,
  IconUser,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react"
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

export function InventoryPermissionsDialog(
  props: InventoryPermissionsDialogProps
) {
  const { onOpenChange, open } = props
  const { state, actions } = useInventoryPermissions(props)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)

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

        <AddPrincipalsDialog
          availablePrincipalIds={state.availablePrincipalIds}
          disabled={state.loading}
          onAdd={(ids) => {
            actions.handleAddPrincipals(ids)
            setAddDialogOpen(false)
          }}
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          principalMap={state.principalMap}
        />

        <div className="-mx-4 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-y px-4 py-6">
          {state.loadError ? (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>Failed to Load ACL</ItemTitle>
                <ItemDescription>
                  {state.loadError instanceof Error
                    ? state.loadError.message
                    : "Could not load principals or ACL entries."}
                </ItemDescription>
              </ItemContent>
            </Item>
          ) : state.loading ? (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>Loading ACL</ItemTitle>
                <ItemDescription>
                  Fetching principals and current permissions.
                </ItemDescription>
              </ItemContent>
            </Item>
          ) : state.principalSections.length > 0 ? (
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
                        {section.items.map((item) => {
                          const inheritedPrincipal =
                            state.inheritedPrincipalMap.get(item.principalId)

                          return (
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
                                  disabled={
                                    item.immutable || !item.hasDraftEntry
                                  }
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

        <CustomizePermissionsDialog
          editingPrincipal={state.editingPrincipal}
          onClose={() => actions.setEditingPrincipalId(null)}
          onOpenChange={(nextOpen) =>
            !nextOpen && actions.setEditingPrincipalId(null)
          }
          onPermissionChange={actions.handlePermissionChange}
          permissionGroups={state.permissionGroups}
        />

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Close</Button>} />
          <Button
            onClick={actions.handleSubmit}
            disabled={state.loading || state.isSaving || !state.hasChanges}
          >
            {state.isSaving ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const InventoryAclDialog = InventoryPermissionsDialog
