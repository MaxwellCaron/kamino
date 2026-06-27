import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
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
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
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
        (mode === "user-groups" ? userGroups : members)?.map(
          (member) => member.id
        ) ?? []
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
      <InlineErrorAlert error={loadError} fallback="Failed to load memberships." />
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
  const baselineIdsRef = React.useRef(serverIds)

  const form = useForm({
    defaultValues: {
      selectedIds: serverIds,
    },
    onSubmit: async ({ value }) => {
      const serverSet = new Set(baselineIdsRef.current)
      const selectedSet = new Set(value.selectedIds)

      const toAdd = value.selectedIds.filter((id) => !serverSet.has(id))
      const toRemove = baselineIdsRef.current.filter(
        (id) => !selectedSet.has(id)
      )

      if (mode === "user-groups") {
        await Promise.all([
          ...toAdd.map((groupID) => addGroupMember(groupID, [principal.id])),
          ...toRemove.map((groupID) =>
            removeGroupMember(groupID, [principal.id])
          ),
        ])
      } else {
        if (toAdd.length > 0) {
          await addGroupMember(principal.id, toAdd)
        }

        if (toRemove.length > 0) {
          await removeGroupMember(principal.id, toRemove)
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["principals"] })
      onOpenChange(false)
    },
  })

  React.useEffect(() => {
    baselineIdsRef.current = serverIds
    form.reset({ selectedIds: serverIds })
  }, [form, serverIds])

  const selectedIds = useSelector(
    form.store,
    (state) => state.values.selectedIds
  )
  const hasChanges = React.useMemo(() => {
    const serverSet = new Set(baselineIdsRef.current)
    const selectedSet = new Set(selectedIds)
    if (serverSet.size !== selectedSet.size) return true
    for (const id of serverSet) {
      if (!selectedSet.has(id)) return true
    }
    return false
  }, [selectedIds])

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

  return (
    <form
      action={() => {
        onOpenChange(false)
        toast.promise(form.handleSubmit(), {
          loading: "Updating memberships...",
          success: "Memberships updated",
          error: formatToastError,
        })
      }}
    >
      <form.Field name="selectedIds">
        {(field) => (
          <Combobox
            multiple
            autoHighlight
            items={options}
            itemToStringLabel={(option) => option.label}
            value={selectedOptions}
            onValueChange={(newValue) =>
              field.handleChange(uniqueIds(newValue.map((option) => option.id)))
            }
          >
            <ComboboxChips ref={anchor} className="mb-6 w-full p-3!">
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
        )}
      </form.Field>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton
              disabled={!hasChanges}
              pending={isSubmitting}
              pendingLabel="Saving..."
            >
              Save
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
