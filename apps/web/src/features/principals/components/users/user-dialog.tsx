import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Add01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import type {
  ApiBulkCreateResponse,
  ApiPrincipal,
  ApiPrincipalProviderCapabilities,
  CreateUserInput,
} from "@/features/principals/types/principals-types"
import type { CreateMode } from "@/features/principals/components/users/user-dialog-utils"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import {
  AppDialog,
  AppDialogPrimaryButton,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import { BulkCreateResultsSummary } from "@/features/principals/components/create-results-summary"
import {
  createUser,
  groupsQueryOptions,
  setUserPassword,
  updateUser,
} from "@/features/principals/api/principals-api"
import { UserDialogCreateForm } from "@/features/principals/components/users/user-dialog-create-form"
import { UserDialogEditForm } from "@/features/principals/components/users/user-dialog-edit-form"
import {
  buildCreateUsers,
  getDefaultUserFormValues,
  normalizeDescription,
  userSchema,
} from "@/features/principals/components/users/user-dialog-utils"

export function UserDialog({
  capabilities,
  user,
  open,
  onOpenChange,
}: {
  capabilities?: ApiPrincipalProviderCapabilities
  user?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!user
  const requireCreatePassword = capabilities?.user_password_on_create ?? true
  const canSetPasswords = capabilities?.can_set_passwords ?? true
  const canRenameUsers = capabilities?.can_rename_users ?? true
  const queryClient = useQueryClient()
  const { data: groups } = useQuery(groupsQueryOptions)
  const [mode, setMode] = React.useState<CreateMode>("single")
  const [resultSummary, setResultSummary] =
    React.useState<ApiBulkCreateResponse | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Array<string>>(
    []
  )

  const groupOptionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups ?? []) {
      map.set(group.id, formatPrincipalReference(group))
    }
    return map
  }, [groups])
  const groupItems = React.useMemo(
    () => Array.from(new Set((groups ?? []).map((group) => group.id))),
    [groups]
  )

  const mutation = useMutation({
    mutationFn: async (
      values: Array<CreateUserInput> | ReturnType<typeof userSchema.parse>
    ) => {
      if (isEdit) {
        const parsed = values as ReturnType<typeof userSchema.parse>
        await updateUser(user.id, {
          username: parsed.username,
          full_name: parsed.fullName,
          description: normalizeDescription(parsed.description ?? ""),
        })
        if (parsed.password && canSetPasswords) {
          await setUserPassword(user.id, parsed.password)
        }
        return null
      }

      return createUser(values as Array<CreateUserInput>)
    },
    onSuccess: async (result) => {
      const invalidatePrincipals = queryClient.invalidateQueries({
        queryKey: ["principals"],
      })

      if (isEdit || result === null) {
        await invalidatePrincipals
        return
      }

      await invalidatePrincipals
      if (result.failures.length > 0) {
        setResultSummary(result)
      }
    },
  })

  const form = useForm({
    defaultValues: getDefaultUserFormValues(user),
    onSubmit: ({ value }) => {
      onOpenChange(false)

      if (isEdit) {
        const parsed = userSchema.parse(value)
        showSingleMutationToast({
          title: "Updating user",
          name: parsed.username,
          promise: mutation.mutateAsync(parsed),
          successDescription: "Updated",
        })
        return
      }

      const payload = buildCreateUsers(
        mode,
        value,
        selectedGroupIds,
        requireCreatePassword
      )
      const createUsers = async (inputs: Array<CreateUserInput>) => {
        const result = await mutation.mutateAsync(inputs)
        if (result === null) {
          throw new Error("User creation returned no result")
        }
        return result
      }
      const userItems = payload.map((input, index) => ({
        id: `${index}:${input.username}`,
        input,
      }))

      showUnitMutationToast({
        title: "Creating users",
        units: userItems.map(({ id, input }) => ({
          items: [
            {
              id,
              name: input.username,
              successDescription: "Created",
            },
          ],
          run: async () => {
            const result = await createUsers([input])
            const failure = result.failures.at(0)
            if (failure) {
              return { failed: [{ id, error: failure.error }] }
            }
          },
        })),
      })
    },
  })

  const resetFields = React.useCallback(() => {
    form.reset(getDefaultUserFormValues(user))
    setMode("single")
    setSelectedGroupIds([])
  }, [form, user])

  const resetDialog = React.useCallback(() => {
    resetFields()
    setResultSummary(null)
  }, [resetFields])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={resetDialog}
      initialFocus={false}
      className={nestedDialogAnimationClassName}
      icon={isEdit ? PencilEdit01Icon : Add01Icon}
      title={isEdit ? "Edit User" : "Create Users"}
      description={
        isEdit
          ? `Update the user account details for ${formatPrincipalReference(user)}.`
          : "Create one or more user accounts in Kamino."
      }
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        {isEdit ? (
          <UserDialogEditForm
            canRenameUsers={canRenameUsers}
            canSetPasswords={canSetPasswords}
            form={form}
          />
        ) : (
          <UserDialogCreateForm
            form={form}
            groupItems={groupItems}
            groupOptionMap={groupOptionMap}
            mode={mode}
            requirePassword={requireCreatePassword}
            selectedGroupIds={selectedGroupIds}
            setMode={setMode}
            setSelectedGroupIds={setSelectedGroupIds}
          />
        )}

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton
                pending={isSubmitting}
                pendingLabel={isEdit ? "Saving..." : "Creating..."}
              >
                {isEdit ? "Save" : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>

      {resultSummary ? (
        <BulkCreateResultsSummary
          entityLabel="user"
          open={true}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setResultSummary(null)
            }
          }}
          result={resultSummary}
        />
      ) : null}
    </AppDialog>
  )
}
