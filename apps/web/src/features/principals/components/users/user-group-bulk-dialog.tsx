import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import type {
  ApiBulkMembershipResponse,
  ApiPrincipal,
} from "@/features/principals/types/principals-types"
import {
  formatPrincipalReference,
  getPrincipalBaseName,
} from "@/components/principals/principal-label"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { PreloadOverlay } from "@/components/loading-overlay"
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

  const membershipMutation = useMutation({
    mutationFn: ({
      groupId,
      userIds,
    }: {
      groupId: string
      userIds: Array<string>
    }): Promise<ApiBulkMembershipResponse> =>
      mode === "add"
        ? addGroupMember(groupId, userIds)
        : removeGroupMember(groupId, userIds),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
  })

  const form = useForm({
    defaultValues: {
      group: null as ApiPrincipal | null,
    },
    validators: {
      onSubmit: userGroupBulkFormSchema,
    },
    onSubmit: ({ value }) => {
      const group = value.group
      if (!group) {
        return
      }

      const groupLabel = formatPrincipalReference(group)
      const selectedUsers = users

      clearSelection()
      onOpenChange(false)

      showUnitMutationToast({
        title:
          mode === "add"
            ? `Adding users to ${groupLabel}`
            : `Removing users from ${groupLabel}`,
        units: [
          {
            items: selectedUsers.map((user) => ({
              id: user.id,
              name: formatPrincipalReference(user),
              successDescription: mode === "add" ? "Added" : "Removed",
              retry: async () => {
                const result = await membershipMutation.mutateAsync({
                  groupId: group.id,
                  userIds: [user.id],
                })
                const failure = result.failed.find(
                  (entry) => entry.id === user.id
                )
                if (failure) {
                  throw new Error(failure.error)
                }
              },
            })),
            run: async () => {
              const result = await membershipMutation.mutateAsync({
                groupId: group.id,
                userIds: selectedUsers.map((user) => user.id),
              })
              return { failed: result.failed }
            },
          },
        ],
      })
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
      <div className="relative min-h-[16.5rem]">
        <PreloadOverlay active={isLoading} label="Loading groups" />
        {error ? (
          <Item variant="muted">
            <ItemContent>
              <ItemDescription>
                {error instanceof Error
                  ? error.message
                  : "Failed to load groups."}
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : !isLoading ? (
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
              <form.Subscribe selector={(state) => state.values.group}>
                {(group) => (
                  <AppDialogPrimaryButton
                    disabled={!group}
                    pending={membershipMutation.isPending}
                    variant={mode === "add" ? "default" : "destructive"}
                  >
                    {mode === "add" ? "Add" : "Remove"}
                  </AppDialogPrimaryButton>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        ) : null}
      </div>
    </AppDialog>
  )
}
