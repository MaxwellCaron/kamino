import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { UserAdd01Icon, UserMinusIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import type { RowSelectionState } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { PrincipalSelectionItem } from "@/components/principals/principal-selection-table"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import { PrincipalSelectionTable } from "@/components/principals/principal-selection-table"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { SearchInputGroup } from "@/components/forms/search-input-group"
import { PreloadOverlay } from "@/components/loading-overlay"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  addGroupMember,
  groupsQueryOptions,
  removeGroupMember,
} from "@/features/principals/api/principals-api"

type UserGroupBulkDialogProps = {
  clearSelection: () => void
  mode: "add" | "remove"
  onOpenChange: (open: boolean) => void
  open: boolean
  users: Array<ApiPrincipal>
}

function membershipOperationId(groupId: string, userId: string): string {
  return `${groupId}:${userId}`
}

export function UserGroupBulkDialog({
  clearSelection,
  mode,
  onOpenChange,
  open,
  users,
}: UserGroupBulkDialogProps) {
  const queryClient = useQueryClient()
  const { data: groups, isLoading, error } = useQuery(groupsQueryOptions)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [search, setSearch] = useState("")
  const selectedUsersLabel =
    users.length === 1
      ? formatPrincipalReference(users[0])
      : `${users.length} selected users`

  const groupOptions = useMemo<Array<PrincipalSelectionItem>>(() => {
    const options: Array<PrincipalSelectionItem> = []
    for (const group of groups ?? []) {
      options.push({
        description: group.external_id,
        id: group.id,
        label: formatPrincipalReference(group),
        type: "group",
      })
    }
    return options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    )
  }, [groups])

  const visibleGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    if (normalizedSearch.length === 0) return groupOptions

    return groupOptions.filter((group) =>
      [group.label, group.description].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch)
      )
    )
  }, [groupOptions, search])

  const selectedGroups = useMemo(
    () => groupOptions.filter((group) => group.id in rowSelection),
    [groupOptions, rowSelection]
  )

  const handleConfirm = () => {
    if (selectedGroups.length === 0 || users.length === 0) return

    const updateMembership = mode === "add" ? addGroupMember : removeGroupMember
    const successDescription = mode === "add" ? "Added" : "Removed"
    const userIds = users.map((user) => user.id)
    const groupCountLabel = `${selectedGroups.length} ${selectedGroups.length === 1 ? "group" : "groups"}`

    const units = selectedGroups.map((group) => ({
      items: users.map((user) => ({
        id: membershipOperationId(group.id, user.id),
        name: `${formatPrincipalReference(user)} · ${group.label}`,
        successDescription,
        retry: async () => {
          const result = await updateMembership(group.id, [user.id])
          const failure = result.failed.find((entry) => entry.id === user.id)
          void queryClient.invalidateQueries({ queryKey: ["principals"] })
          if (failure) throw new Error(failure.error)
        },
      })),
      run: async () => {
        const result = await updateMembership(group.id, userIds)
        return {
          failed: result.failed.map((failure) => ({
            ...failure,
            id: membershipOperationId(group.id, failure.id),
          })),
        }
      },
    }))

    clearSelection()
    setRowSelection({})
    setSearch("")
    onOpenChange(false)

    showUnitMutationToast({
      title:
        mode === "add"
          ? `Adding users to ${groupCountLabel}`
          : `Removing users from ${groupCountLabel}`,
      units,
      concurrency: 1,
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: ["principals"] })
      },
    })
  }

  const emptyMessage =
    groupOptions.length === 0
      ? "No groups are available."
      : "No groups match your search."

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        setRowSelection({})
        setSearch("")
      }}
      icon={mode === "add" ? UserAdd01Icon : UserMinusIcon}
      title={mode === "add" ? "Add Users" : "Remove Users"}
      description={
        mode === "add"
          ? `Choose groups to add ${selectedUsersLabel} to.`
          : `Choose groups to remove ${selectedUsersLabel} from.`
      }
      descriptionProps={{ render: <div /> }}
    >
      {isLoading ? (
        <div className="relative min-h-66">
          <PreloadOverlay active label="Loading groups" />
        </div>
      ) : error ? (
        <InlineErrorAlert error={error} fallback="Failed to load groups." />
      ) : (
        <>
          <SearchInputGroup
            aria-label="Search groups"
            placeholder="Search groups..."
            value={search}
            onValueChange={setSearch}
            resultCount={visibleGroups.length}
            resultLabel={(count) =>
              `${count} ${count === 1 ? "group" : "groups"}`
            }
          />
          <AppDialogScrollBody className="-mx-6 -mb-8 p-0">
            <PrincipalSelectionTable
              data={visibleGroups}
              emptyMessage={emptyMessage}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              selectAllLabel="Select all visible groups"
            />
          </AppDialogScrollBody>
          <DialogFooter>
            <AppDialogPrimaryButton
              type="button"
              disabled={selectedGroups.length === 0 || users.length === 0}
              variant={mode === "add" ? "default" : "destructive"}
              onClick={handleConfirm}
            >
              {mode === "add" ? "Add" : "Remove"}{" "}
              <span className="tabular-nums">{users.length}</span>{" "}
              {users.length === 1 ? "user" : "users"}{" "}
              {mode === "add" ? "to" : "from"}{" "}
              <span className="tabular-nums">{selectedGroups.length}</span>{" "}
              {selectedGroups.length === 1 ? "group" : "groups"}
            </AppDialogPrimaryButton>
          </DialogFooter>
        </>
      )}
    </AppDialog>
  )
}
