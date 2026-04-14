import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { nestedDialogAnimationClassName } from "./constants"
import { PermissionScopeSection } from "./permission-scope-section"
import type { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"
import type { DraftPrincipal, PermissionState } from "./types"

type CustomizePermissionsDialogProps = {
  editingPrincipal: DraftPrincipal | null
  onClose: () => void
  onOpenChange: (open: boolean) => void
  onPermissionChange: (
    principalId: string,
    bit: number,
    state: PermissionState
  ) => void
  permissionGroups: ReturnType<typeof getInventoryPermissionDefinitionsByGroup>
}

export function CustomizePermissionsDialog({
  editingPrincipal,
  onClose,
  onOpenChange,
  onPermissionChange,
  permissionGroups,
}: CustomizePermissionsDialogProps) {
  return (
    <Dialog open={editingPrincipal !== null} onOpenChange={onOpenChange}>
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
            <PermissionScopeSection
              onPermissionChange={(bit, state) =>
                onPermissionChange(editingPrincipal.principalId, bit, state)
              }
              permissionGroups={permissionGroups}
              principal={editingPrincipal}
            />
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Close</Button>} />
          <Button onClick={onClose} disabled={editingPrincipal?.immutable}>
            {editingPrincipal?.immutable ? "Protected" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
