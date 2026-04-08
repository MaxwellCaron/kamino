import { useEffect, useMemo, useState } from "react"
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
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
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
  const [groupId, setGroupId] = useState("")

  useEffect(() => {
    if (!open) {
      setGroupId("")
    }
  }, [open])

  const selectedGroup = useMemo(
    () => groups?.find((group) => group.id === groupId) ?? null,
    [groupId, groups]
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const userIds = users.map((user) => user.id)
      if (mode === "add") {
        return addGroupMember(groupId, userIds)
      }
      return removeGroupMember(groupId, userIds)
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
          <DialogTitle>
            {mode === "add" ? "Add Users To Group" : "Remove Users From Group"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? `Add ${users.length} selected user${users.length === 1 ? "" : "s"} to an existing group. Users already in the group will be kept there.`
              : `Remove ${users.length} selected user${users.length === 1 ? "" : "s"} from an existing group. Users not in the group will remain unchanged.`}
          </DialogDescription>
        </DialogHeader>

        <Item variant="outline">
          <ItemMedia variant="icon">
            {mode === "add" ? <IconUserPlus /> : <IconUserMinus />}
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Users</ItemTitle>
            <ItemDescription>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => (
                  <Badge
                    key={user.id}
                    variant={mode === "add" ? "default" : "destructive"}
                  >
                    {user.name ?? user.external_id}
                  </Badge>
                ))}
              </div>
            </ItemDescription>
          </ItemContent>
        </Item>

        <div className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bulk-group-target">Group</FieldLabel>
              <FieldContent>
                <Select
                  value={groupId || null}
                  onValueChange={(value) => setGroupId(value ?? "")}
                >
                  <SelectTrigger id="bulk-group-target" className="w-full">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              !groupId || isLoading || error !== null || mutation.isPending
            }
            variant={mode === "add" ? "default" : "destructive"}
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
