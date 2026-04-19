import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { IconUserMinus, IconUserPlus } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Item,
  ItemContent,
  ItemDescription,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { Badge } from "@workspace/ui/components/badge"
import type { ApiPrincipal } from "@/lib/queries"
import {
  addGroupMember,
  groupsQueryOptions,
  removeGroupMember,
} from "@/lib/queries"

type UserGroupBulkDialogProps = {
  clearSelection: () => void
  mode: "add" | "remove"
  onOpenChange: (open: boolean) => void
  open: boolean
  users: Array<ApiPrincipal>
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
  const [selectedGroup, setSelectedGroup] = useState<ApiPrincipal | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedGroup(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const userIds = users.map((user) => user.id)
      if (mode === "add") {
        return addGroupMember(selectedGroup!.id, userIds)
      }
      return removeGroupMember(selectedGroup!.id, userIds)
    },
    onSuccess: async (result) => {
      const succeededCount = result.succeeded.length
      const failedCount = result.failed.length
      const groupLabel = selectedGroup ? selectedGroup.name : "group"

      if (succeededCount > 0) {
        toast.success(
          mode === "add"
            ? `Added ${succeededCount} user${succeededCount === 1 ? "" : "s"} to ${groupLabel}`
            : `Removed ${succeededCount} user${succeededCount === 1 ? "" : "s"} from ${groupLabel}`
        )
      }

      if (failedCount === 1) {
        toast.error(
          `${mode === "add" ? "Failed to add" : "Failed to remove"} ${result.failed[0].id}: ${result.failed[0].error}`
        )
      } else if (failedCount > 1) {
        toast.error(
          `${mode === "add" ? "Failed to add" : "Failed to remove"} ${failedCount} users`
        )
      }

      await queryClient.invalidateQueries({ queryKey: ["principals"] })

      if (failedCount === 0) {
        clearSelection()
        onOpenChange(false)
      }
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "add" ? (
              <IconUserPlus className="text-muted-foreground" />
            ) : (
              <IconUserMinus className="text-muted-foreground" />
            )}
            <span className="text-2xl font-semibold tracking-tight">
              {mode === "add" ? "Add Users" : "Remove Users"}
            </span>
          </DialogTitle>
          <DialogDescription render={<div />}>
            {mode === "add" ? (
              <>
                <p>{`Add ${users.length} selected user${users.length === 1 ? "" : "s"} to an existing group.`}</p>
                <p>Users already in the group will be kept there.</p>
              </>
            ) : (
              <>
                <p>{`Remove ${users.length} selected user${users.length === 1 ? "" : "s"} from an existing group.`}</p>
                <p>Users not in the group will remain unchanged.</p>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Item variant="outline">
          <ItemContent>
            <ItemDescription>
              <span className="flex flex-wrap gap-2">
                {users.map((user) => (
                  <Badge
                    key={user.id}
                    variant={mode === "add" ? "default" : "destructive"}
                  >
                    {user.name ?? user.external_id}
                  </Badge>
                ))}
              </span>
            </ItemDescription>
          </ItemContent>
        </Item>

        <div className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bulk-group-target">Group</FieldLabel>
              <FieldContent>
                <Combobox
                  items={groups ?? []}
                  itemToStringLabel={(group) => group.name ?? group.external_id}
                  value={selectedGroup}
                  onValueChange={setSelectedGroup}
                >
                  <ComboboxInput placeholder="Select a group" />
                  <ComboboxContent>
                    <ComboboxEmpty>No groups found.</ComboboxEmpty>
                    <ComboboxList>
                      {(group) => (
                        <ComboboxItem key={group.id} value={group}>
                          {group.name ?? group.external_id}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </FieldContent>
              <FieldDescription>
                {`Group that the users will be ${mode === "add" ? "added to" : "removed from"}.`}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              !selectedGroup ||
              isLoading ||
              error !== null ||
              mutation.isPending
            }
            variant={mode === "add" ? "default" : "destructive"}
            className="w-full"
          >
            {mutation.isPending
              ? mode === "add"
                ? "Adding..."
                : "Removing..."
              : mode === "add"
                ? "Add"
                : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
