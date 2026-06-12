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
  // Current memberships
  const {
    data: members,
    error: membersError,
    isLoading: isMembersLoading,
  } = useQuery({
    ...groupMembersQueryOptions(principal.id),
    enabled: open && mode === "group-members",
  })
  const {
    data: userGroups,
    error: userGroupsError,
    isLoading: isUserGroupsLoading,
  } = useQuery({
    ...userGroupsQueryOptions(principal.id),
    enabled: open && mode === "user-groups",
  })
  // All possible options
  const {
    data: allGroups,
    error: allGroupsError,
    isLoading: isAllGroupsLoading,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: open && mode === "user-groups",
  })
  const {
    data: allUsers,
    error: allUsersError,
    isLoading: isAllUsersLoading,
  } = useQuery({
    ...usersQueryOptions,
    enabled: open && mode === "group-members",
  })
  const isLoading =
    mode === "user-groups"
      ? isUserGroupsLoading || isAllGroupsLoading
      : isMembersLoading || isAllUsersLoading
  const loadError =
    mode === "user-groups"
      ? (userGroupsError ?? allGroupsError)
      : (membersError ?? allUsersError)
  const serverIds = React.useMemo(
    () =>
      uniqueIds(
        (mode === "user-groups" ? userGroups : members)?.map((member) => member.id) ??
          []
      ),
    [members, mode, userGroups]
  )

  const options = React.useMemo<Array<MembershipOption>>(
    () =>
      (mode === "user-groups" ? allGroups : allUsers)?.map((option) => ({
        id: option.id,
        label: option.name ?? option.external_id,
      })) ?? [],
    [allGroups, allUsers, mode]
  )

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
    <MembershipForm
      key={`${mode}:${principal.id}`}
      mode={mode}
      principal={principal}
      serverIds={serverIds}
      options={options}
      onOpenChange={onOpenChange}
    />
  )
}

function MembershipForm({
  mode,
  principal,
  serverIds,
  options,
  onOpenChange,
}: {
  mode: "user-groups" | "group-members"
  principal: ApiPrincipal
  serverIds: Array<string>
  options: Array<MembershipOption>
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const anchor = useComboboxAnchor()
  const [selected, setSelected] = React.useState<Array<string>>(() => serverIds)

  const optionMap = React.useMemo(() => {
    const map = new Map<string, MembershipOption>()
    for (const option of options) {
      map.set(option.id, option)
    }
    return map
  }, [options])

  const selectedOptions = React.useMemo(
    () =>
      selected
        .map((id) => optionMap.get(id))
        .filter((option): option is MembershipOption => !!option),
    [optionMap, selected]
  )

  const hasChanges = React.useMemo(() => {
    const serverSet = new Set(serverIds)
    const selectedSet = new Set(selected)
    if (serverSet.size !== selectedSet.size) return true
    for (const id of serverSet) {
      if (!selectedSet.has(id)) return true
    }
    return false
  }, [serverIds, selected])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const serverSet = new Set(serverIds)
      const selectedSet = new Set(selected)

      const toAdd = selected.filter((id) => !serverSet.has(id))
      const toRemove = serverIds.filter((id) => !selectedSet.has(id))

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

  return (
    <>
      <Combobox
        multiple
        autoHighlight
        items={options}
        itemToStringLabel={(option) => option.label}
        value={selectedOptions}
        onValueChange={(newValue) =>
          setSelected(uniqueIds(newValue.map((option) => option.id)))
        }
      >
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {(values) => (
              <React.Fragment>
                {(values as Array<MembershipOption>).map((option) => (
                  <ComboboxChip key={option.id}>{option.label}</ComboboxChip>
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
