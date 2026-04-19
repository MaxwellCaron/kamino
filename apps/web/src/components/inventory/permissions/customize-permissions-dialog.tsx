import React from "react"
import { IconSearch } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { nestedDialogAnimationClassName } from "./constants"
import { PermissionScopeSection } from "./permission-scope-section"
import type { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"
import type { DraftPrincipal, PermissionState } from "./types"

type CustomizePermissionsDialogProps = {
  editingPrincipal: DraftPrincipal | null
  onSave: () => void
  onOpenChange: (open: boolean) => void
  onPermissionChange: (bit: number, state: PermissionState) => void
  permissionGroups: ReturnType<typeof getInventoryPermissionDefinitionsByGroup>
}

export function CustomizePermissionsDialog({
  editingPrincipal,
  onSave,
  onOpenChange,
  onPermissionChange,
  permissionGroups,
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
            group.group,
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
      <DialogContent
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
        <div className="-mx-4 -mb-6 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-t pt-6">
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
        </div>
        <DialogFooter>
          <Button
            onClick={onSave}
            disabled={editingPrincipal?.immutable}
            className="w-full"
          >
            {editingPrincipal?.immutable ? "Protected" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
