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
import type { ApiGroupMember, ApiPrincipal } from "@/lib/queries"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import {
  addGroupMember,
  groupMembersQueryOptions,
  groupsQueryOptions,
  removeGroupMember,
  userGroupsQueryOptions,
  usersQueryOptions,
} from "@/lib/queries"

type MembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  principal: ApiPrincipal
} & ({ mode: "user-groups" } | { mode: "group-members" })

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
  const [saving, setSaving] = React.useState(false)

  // Current memberships
  const membersQuery = useQuery(groupMembersQueryOptions(principal.id))
  const userGroupsQuery = useQuery(userGroupsQueryOptions(principal.id))
  const activeQuery = mode === "user-groups" ? userGroupsQuery : membersQuery
  const currentMembers: Array<ApiGroupMember> = activeQuery.data ?? []

  // All possible options
  const allGroupsQuery = useQuery(groupsQueryOptions)
  const allUsersQuery = useQuery(usersQueryOptions)
  const allOptions: Array<ApiPrincipal> =
    (mode === "user-groups" ? allGroupsQuery.data : allUsersQuery.data) ?? []

  const serverIds = React.useMemo(
    () => uniqueIds(currentMembers.map((m) => m.id)),
    [currentMembers]
  )

  React.useEffect(() => {
    if (!open) {
      setLocalValue(null)
      setSaving(false)
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

  // Build lookup for display names
  const optionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const o of allOptions) {
      map.set(o.id, o.name ?? o.external_id)
    }
    return map
  }, [allOptions])

  // All option IDs for the combobox (deduplicated)
  const items = React.useMemo(
    () => Array.from(new Set(allOptions.map((o) => o.id))),
    [allOptions]
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
    onMutate: () => setSaving(true),
    onSettled: () => setSaving(false),
    onSuccess: () => {
      toast.success("Memberships updated")
      queryClient.invalidateQueries({ queryKey: ["principals"] })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <>
      <Combobox
        multiple
        autoHighlight
        items={items}
        value={selectedIds}
        onValueChange={(newValue) => setLocalValue(uniqueIds(newValue))}
      >
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {(values) => (
              <React.Fragment>
                {(values as Array<string>).map((id) => (
                  <ComboboxChip key={id}>
                    {optionMap.get(id) ?? id}
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
            {(id) => (
              <ComboboxItem key={id as string} value={id as string}>
                {optionMap.get(id as string) ?? (id as string)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <DialogFooter>
        <AppDialogPrimaryButton
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saving}
        >
          {saving ? "Saving..." : "Save"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
