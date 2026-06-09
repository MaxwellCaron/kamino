import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconUsersGroup } from "@tabler/icons-react"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
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
import type {
  ApiGroupMember,
  ApiPrincipal,
} from "@/features/principals/types/principals-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import {
  addGroupMember,
  groupMembersQueryOptions,
  groupsQueryOptions,
  removeGroupMember,
  userGroupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { formatToastError } from "@/features/shared/utils/format"

type MembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  principal: ApiPrincipal
} & ({ mode: "user-groups" } | { mode: "group-members" })

type MembershipOption = {
  id: string
  label: string
}

function uniqueIds(ids: Array<string>): Array<string> {
  return Array.from(new Set(ids))
}

export function MembershipDialog(props: MembershipDialogProps) {
  const { open, onOpenChange, mode, principal } = props

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      initialFocus={false}
      icon={IconUsersGroup}
      title={mode === "user-groups" ? "Groups" : "Members"}
      description={
        mode === "user-groups"
          ? `Manage group memberships for ${principal.name ?? principal.external_id}.`
          : `Manage members of ${principal.name ?? principal.external_id}.`
      }
    >
      <MembershipEditor
        open={open}
        mode={mode}
        principal={principal}
        onOpenChange={onOpenChange}
      />
    </AppDialog>
  )
}

function MembershipEditor({
  open,
  mode,
  principal,
  onOpenChange,
}: {
  open: boolean
  mode: "user-groups" | "group-members"
  principal: ApiPrincipal
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const anchor = useComboboxAnchor()
  const [localValue, setLocalValue] = React.useState<Array<string> | null>(null)

  // Current memberships
  const membersQuery = useQuery({
    ...groupMembersQueryOptions(principal.id),
    enabled: open && mode === "group-members",
  })
  const userGroupsQuery = useQuery({
    ...userGroupsQueryOptions(principal.id),
    enabled: open && mode === "user-groups",
  })
  const activeQuery = mode === "user-groups" ? userGroupsQuery : membersQuery
  const currentMembers: Array<ApiGroupMember> = activeQuery.data ?? []

  // All possible options
  const allGroupsQuery = useQuery({
    ...groupsQueryOptions,
    enabled: open && mode === "user-groups",
  })
  const allUsersQuery = useQuery({
    ...usersQueryOptions,
    enabled: open && mode === "group-members",
  })
  const optionsQuery = mode === "user-groups" ? allGroupsQuery : allUsersQuery
  const isLoading = activeQuery.isLoading || optionsQuery.isLoading
  const loadError = activeQuery.error ?? optionsQuery.error
  const allOptions: Array<ApiPrincipal> =
    (mode === "user-groups" ? allGroupsQuery.data : allUsersQuery.data) ?? []

  const serverIds = React.useMemo(
    () => uniqueIds(currentMembers.map((m) => m.id)),
    [currentMembers]
  )

  React.useEffect(() => {
    if (!open) {
      setLocalValue(null)
    }
  }, [open])

  // Initialize local value from server data once loaded
  React.useEffect(() => {
    if (open && localValue === null && activeQuery.isSuccess) {
      setLocalValue(serverIds)
    }
  }, [open, localValue, activeQuery.isSuccess, serverIds])

  const selectedIds = React.useMemo(
    () => uniqueIds(localValue ?? serverIds),
    [localValue, serverIds]
  )

  const options = React.useMemo<Array<MembershipOption>>(
    () =>
      allOptions.map((option) => ({
        id: option.id,
        label: option.name ?? option.external_id,
      })),
    [allOptions]
  )

  const optionMap = React.useMemo(() => {
    const map = new Map<string, MembershipOption>()
    for (const option of options) {
      map.set(option.id, option)
    }
    return map
  }, [options])

  const selectedOptions = React.useMemo(
    () =>
      selectedIds
        .map((id) => optionMap.get(id))
        .filter((option): option is MembershipOption => !!option),
    [optionMap, selectedIds]
  )

  const hasChanges = React.useMemo(() => {
    const serverSet = new Set(serverIds)
    const localSet = new Set(selectedIds)
    if (serverSet.size !== localSet.size) return true
    for (const id of serverSet) {
      if (!localSet.has(id)) return true
    }
    return false
  }, [serverIds, selectedIds])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const serverSet = new Set(serverIds)
      const localSet = new Set(selectedIds)

      const toAdd = selectedIds.filter((id) => !serverSet.has(id))
      const toRemove = serverIds.filter((id) => !localSet.has(id))

      if (mode === "user-groups") {
        await Promise.all([
          ...toAdd.map((groupID) => addGroupMember(groupID, [principal.id])),
          ...toRemove.map((groupID) =>
            removeGroupMember(groupID, [principal.id])
          ),
        ])
        return
      }

      if (toAdd.length > 0) {
        await addGroupMember(principal.id, toAdd)
      }

      if (toRemove.length > 0) {
        await removeGroupMember(principal.id, toRemove)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
  })

  const handleSave = () => {
    onOpenChange(false)
    toast.promise(saveMutation.mutateAsync(), {
      loading: "Updating memberships...",
      success: "Memberships updated",
      error: formatToastError,
    })
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {loadError instanceof Error
          ? loadError.message
          : "Failed to load memberships."}
      </div>
    )
  }

  if (isLoading) {
    return <DialogBodySkeleton rows={3} />
  }

  return (
    <>
      <Combobox
        multiple
        autoHighlight
        items={options}
        itemToStringLabel={(option) => option.label}
        value={selectedOptions}
        onValueChange={(newValue) =>
          setLocalValue(uniqueIds(newValue.map((option) => option.id)))
        }
      >
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {(values) => (
              <React.Fragment>
                {(values as Array<MembershipOption>).map((option) => (
                  <ComboboxChip key={option.id}>
                    {option.label}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  placeholder={
                    mode === "user-groups"
                      ? "Search groups..."
                      : "Search users..."
                  }
                />
              </React.Fragment>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(option) => (
              <ComboboxItem key={option.id} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <DialogFooter>
        <AppDialogPrimaryButton
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
