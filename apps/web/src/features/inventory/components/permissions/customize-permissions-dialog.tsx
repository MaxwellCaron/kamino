import React from "react"
import { IconSearch, IconSettings } from "@tabler/icons-react"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { PermissionScopeSection } from "./permission-scope-section"
import type { InventoryPermissionSection } from "../../utils/inventory-permissions"
import type {
  DraftPrincipal,
  PermissionState,
} from "../../types/inventory-types"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"

type CustomizePermissionsDialogProps = {
  editingPrincipal: DraftPrincipal | null
  onSave: () => void
  onOpenChange: (open: boolean) => void
  onPermissionChange: (bit: number, state: PermissionState) => void
  permissionGroups: Array<InventoryPermissionSection>
  showOverlay?: boolean
}

export function CustomizePermissionsDialog({
  editingPrincipal,
  onSave,
  onOpenChange,
  onPermissionChange,
  permissionGroups,
  showOverlay = false,
}: CustomizePermissionsDialogProps) {
  const [permissionSearch, setPermissionSearch] = React.useState("")

  React.useEffect(() => {
    if (!editingPrincipal) {
      setPermissionSearch("")
    }
  }, [editingPrincipal])

  const normalizedPermissionSearch = permissionSearch.trim().toLocaleLowerCase()

  const filteredPermissionGroups = React.useMemo(() => {
    if (normalizedPermissionSearch === "") {
      return permissionGroups
    }

    return permissionGroups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((permission) =>
          [
            group.key,
            group.label,
            permission.key,
            permission.label,
            permission.description,
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedPermissionSearch)
          )
        ),
      }))
      .filter((group) => group.permissions.length > 0)
  }, [normalizedPermissionSearch, permissionGroups])

  const filteredPermissionCount = React.useMemo(
    () =>
      filteredPermissionGroups.reduce(
        (count, group) => count + group.permissions.length,
        0
      ),
    [filteredPermissionGroups]
  )

  return (
    <Dialog open={editingPrincipal !== null} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={editingPrincipal !== null}
        icon={IconSettings}
        title="Customize Permissions"
        description={`Update permissions for ${editingPrincipal?.principalName || "this principal"}.`}
        showOverlay={showOverlay}
        className={nestedDialogAnimationClassName}
      >
        <InputGroup>
          <InputGroupInput
            placeholder="Search permissions..."
            value={permissionSearch}
            onChange={(event) => setPermissionSearch(event.target.value)}
            aria-label="Search permissions"
          />
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {filteredPermissionCount}{" "}
            {filteredPermissionCount === 1 ? "result" : "results"}
          </InputGroupAddon>
        </InputGroup>
        <AppDialogScrollBody className="-mb-8 px-0">
          {editingPrincipal ? (
            filteredPermissionCount > 0 ? (
              <PermissionScopeSection
                onPermissionChange={onPermissionChange}
                permissionGroups={filteredPermissionGroups}
                principal={editingPrincipal}
              />
            ) : (
              <div className="px-4">
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconSearch />
                    </EmptyMedia>
                    <EmptyTitle>No Matching Permissions</EmptyTitle>
                    <EmptyDescription>
                      No permissions match your search.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )
          ) : null}
        </AppDialogScrollBody>
        <DialogFooter>
          <AppDialogPrimaryButton
            onClick={onSave}
            disabled={editingPrincipal?.immutable}
          >
            {editingPrincipal?.immutable ? "Protected" : "Save"}
          </AppDialogPrimaryButton>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}
