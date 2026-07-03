import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { UserAdd01Icon, UserMinusIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
} from "@workspace/ui/components/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import {
  formatPrincipalReference,
  getPrincipalBaseName,
} from "@/components/principals/principal-label"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import {
  addGroupMember,
  groupsQueryOptions,
  removeGroupMember,
} from "@/features/principals/api/principals-api"
import {
  capitalizeFirstLetter,
  formatToastError,
} from "@/features/shared/utils/format"

type UserGroupBulkDialogProps = {
  clearSelection: () => void
  mode: "add" | "remove"
  onOpenChange: (open: boolean) => void
  open: boolean
  users: Array<ApiPrincipal>
}

const userGroupBulkFormSchema = z.object({
  group: z
    .custom<ApiPrincipal>((value) => value !== null, {
      message: "Select a group before continuing.",
    })
    .nullable()
    .refine((value): value is ApiPrincipal => value !== null, {
      message: "Select a group before continuing.",
    }),
})

export function UserGroupBulkDialog({
  clearSelection,
  mode,
  onOpenChange,
  open,
  users,
}: UserGroupBulkDialogProps) {
  const queryClient = useQueryClient()
  const { data: groups, isLoading, error } = useQuery(groupsQueryOptions)
  const selectedUsersLabel =
    users.length === 1
      ? formatPrincipalReference(users[0])
      : `${users.length} selected users`

  const form = useForm({
    defaultValues: {
      group: null as ApiPrincipal | null,
    },
    validators: {
      onSubmit: userGroupBulkFormSchema,
    },
    onSubmit: async ({ value }) => {
      const group = value.group
      if (!group) {
        return
      }

      try {
        const userIds = users.map((user) => user.id)
        const result =
          mode === "add"
            ? await addGroupMember(group.id, userIds)
            : await removeGroupMember(group.id, userIds)

        const succeededCount = result.succeeded.length
        const failedCount = result.failed.length
        const groupLabel = formatPrincipalReference(group)

        if (succeededCount > 0) {
          toast.success(
            mode === "add"
              ? `Added ${succeededCount} user${succeededCount === 1 ? "" : "s"} to ${groupLabel}`
              : `Removed ${succeededCount} user${succeededCount === 1 ? "" : "s"} from ${groupLabel}`
          )
        }

        if (failedCount === 1) {
          toast.error(
            `${mode === "add" ? "Failed to add" : "Failed to remove"} ${result.failed[0].id}: ${capitalizeFirstLetter(result.failed[0].error)}`
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
      } catch (err) {
        toast.error(formatToastError(err))
      }
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={mode === "add" ? UserAdd01Icon : UserMinusIcon}
      title={mode === "add" ? "Add Users" : "Remove Users"}
      description={
        mode === "add"
          ? `Add ${selectedUsersLabel} to an existing group.`
          : `Remove ${selectedUsersLabel} from an existing group.`
      }
      descriptionProps={{ render: <div /> }}
    >
      {isLoading ? (
        <DialogBodySkeleton rows={3} />
      ) : error ? (
        <Item variant="muted">
          <ItemContent>
            <ItemDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load groups."}
            </ItemDescription>
          </ItemContent>
        </Item>
      ) : (
        <form
          action={() => {
            void form.handleSubmit()
          }}
        >
          <FieldGroup className="-mt-2 pb-3">
            <form.Field name="group">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldContent>
                      <Combobox
                        items={groups ?? []}
                        itemToStringLabel={(group) =>
                          formatPrincipalReference(group)
                        }
                        value={field.state.value}
                        onValueChange={(group) => field.handleChange(group)}
                      >
                        <ComboboxInput
                          id={field.name}
                          placeholder="Select a group"
                          aria-invalid={isInvalid}
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No groups found.</ComboboxEmpty>
                          <ComboboxList>
                            {(group) => (
                              <ComboboxItem key={group.id} value={group}>
                                {formatPrincipalReference(group)}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </FieldContent>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>

          <AppDialogScrollBody className="gap-4">
            <ItemGroup>
              {users.map((user) => (
                <Item key={user.id} variant="muted">
                  <ItemMedia variant="icon">
                    <FacehashIcon
                      name={getPrincipalBaseName(user)}
                      size={28}
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{formatPrincipalReference(user)}</ItemTitle>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </AppDialogScrollBody>

          <DialogFooter>
            <form.Subscribe
              selector={(state) =>
                [state.values.group, state.isSubmitting] as const
              }
            >
              {([group, isSubmitting]) => (
                <AppDialogPrimaryButton
                  disabled={!group}
                  pending={isSubmitting}
                  pendingLabel={mode === "add" ? "Adding..." : "Removing..."}
                  variant={mode === "add" ? "default" : "destructive"}
                >
                  {mode === "add" ? "Add" : "Remove"}
                </AppDialogPrimaryButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      )}
    </AppDialog>
  )
}
