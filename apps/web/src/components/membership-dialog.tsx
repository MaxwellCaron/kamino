import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { IconDeviceFloppy } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
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

export function MembershipDialog(props: MembershipDialogProps) {
  const { open, onOpenChange, mode, principal } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "user-groups" ? "Edit Groups" : "Edit Members"}
          </DialogTitle>
          <DialogDescription>
            {mode === "user-groups"
              ? `Manage group memberships for ${principal.name ?? principal.external_id}.`
              : `Manage members of ${principal.name ?? principal.external_id}.`}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MembershipEditor
            mode={mode}
            principal={principal}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MembershipEditor({
  mode,
  principal,
  onOpenChange,
}: {
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
    () => currentMembers.map((m) => m.id),
    [currentMembers]
  )

  // Initialize local value from server data once loaded
  React.useEffect(() => {
    if (localValue === null && activeQuery.isSuccess) {
      setLocalValue(serverIds)
    }
  }, [localValue, activeQuery.isSuccess, serverIds])

  const selectedIds = localValue ?? serverIds

  // Build lookup for display names
  const optionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const o of allOptions) {
      map.set(o.id, o.name ?? o.external_id)
    }
    return map
  }, [allOptions])

  // All option IDs for the combobox, excluding self
  const items = React.useMemo(
    () => allOptions.filter((o) => o.id !== principal.id).map((o) => o.id),
    [allOptions, principal.id]
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
      <div className="py-2">
        <Combobox
          multiple
          autoHighlight
          items={items}
          value={selectedIds}
          onValueChange={(newValue) => setLocalValue(newValue)}
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
      </div>
      <DialogFooter>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saving}
        >
          <IconDeviceFloppy data-icon="inline-start" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}
