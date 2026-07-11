import { HugeiconsIcon } from "@hugeicons/react"
import {
  AddTeam02Icon,
  Cancel01Icon,
  Delete01Icon,
  Tick01Icon,
  UserMinusIcon,
} from "@hugeicons/core-free-icons"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { formatPrincipalReference } from "@/components/principals/principal-label"

type BulkGroupContext = {
  clearSelection: () => void
  mode: "add" | "remove"
  users: Array<ApiPrincipal>
}

type UsersSelectionActionsProps = {
  clearSelection: () => void
  selectedRows: Array<ApiPrincipal>
  canEnableUsers: boolean
  canDisableUsers: boolean
  onAddToGroup: (ctx: BulkGroupContext) => void
  onEnableUsers: (users: Array<ApiPrincipal>) => void
  onDisableUsers: (users: Array<ApiPrincipal>, clearSelection: () => void) => void
  onDeleteUsers: (users: Array<ApiPrincipal>, clearSelection: () => void) => void
  onConfirm: (config: ConfirmConfig) => void
}

export function UsersSelectionActions({
  clearSelection,
  selectedRows,
  canEnableUsers,
  canDisableUsers,
  onAddToGroup,
  onEnableUsers,
  onDisableUsers,
  onDeleteUsers,
  onConfirm,
}: UsersSelectionActionsProps) {
  const isSingle = selectedRows.length === 1

  return (
    <>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          onAddToGroup({
            clearSelection,
            mode: "add",
            users: selectedRows,
          })
        }
        aria-label="Add selected users to a group"
        tooltip="Add to group"
        variant="default"
      >
        <HugeiconsIcon icon={AddTeam02Icon} />
      </ActionBarItem>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          onAddToGroup({
            clearSelection,
            mode: "remove",
            users: selectedRows,
          })
        }
        aria-label="Remove selected users from a group"
        tooltip="Remove from group"
        variant="destructive"
      >
        <HugeiconsIcon icon={UserMinusIcon} />
      </ActionBarItem>
      <ActionBarSeparator />
      {canEnableUsers ? (
        <ActionBarItem
          onSelect={(event) => event.preventDefault()}
          onClick={() => onEnableUsers(selectedRows)}
          aria-label="Enable selected users"
          tooltip="Enable users"
          variant="default"
        >
          <HugeiconsIcon icon={Tick01Icon} />
        </ActionBarItem>
      ) : null}
      {canDisableUsers ? (
        <ActionBarItem
          variant="destructive"
          onSelect={(event) => event.preventDefault()}
          aria-label="Disable selected users"
          tooltip="Disable users"
          onClick={() =>
            onConfirm({
              title: isSingle ? "Disable User" : "Disable Users",
              icon: Cancel01Icon,
              description: isSingle
                ? `Disable ${formatPrincipalReference(selectedRows[0])}? Active sessions will be revoked.`
                : `Disable ${selectedRows.length} users? Active sessions will be revoked.`,
              actionLabel: "Disable",
              variant: "destructive",
              onConfirm: () => onDisableUsers(selectedRows, clearSelection),
            })
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </ActionBarItem>
      ) : null}
      <ActionBarItem
        variant="destructive"
        onSelect={(event) => event.preventDefault()}
        aria-label="Delete selected users"
        tooltip="Delete users"
        onClick={() =>
          onConfirm({
            title: isSingle ? "Delete User" : "Delete Users",
            icon: Delete01Icon,
            description: isSingle
              ? `Are you sure you want to delete ${formatPrincipalReference(selectedRows[0])}? This will permanently remove the user.`
              : `Are you sure you want to delete ${selectedRows.length} users? This will permanently remove the selected users.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => onDeleteUsers(selectedRows, clearSelection),
          })
        }
      >
        <HugeiconsIcon icon={Delete01Icon} />
      </ActionBarItem>
    </>
  )
}