import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconEdit, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import type {
  ApiBulkCreateResponse,
  ApiPrincipal,
  CreateUserInput,
} from "@/features/principals/types/principals-types"
import type { CreateMode } from "@/features/principals/components/users/user-dialog-utils"
import {
  AppDialog,
  AppDialogPrimaryButton,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
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
import { formatToastError } from "@/features/shared/utils/format"

export function UserDialog({
  user,
  open,
  onOpenChange,
}: {
  user?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!user
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
      map.set(group.id, group.name ?? group.external_id)
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
          description: normalizeDescription(parsed.description ?? ""),
        })
        if (parsed.password) {
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
        toast.promise(mutation.mutateAsync(parsed), {
          loading: "Updating user...",
          success: "User updated",
          error: formatToastError,
        })
        return
      }

      const payload = buildCreateUsers(mode, value, selectedGroupIds)
      toast.promise(mutation.mutateAsync(payload), {
        loading: "Creating users...",
        success: (result) => {
          if (result && result.failures.length > 0) {
            return `Created ${result.successful} user${result.successful === 1 ? "" : "s"} with some failures`
          }
          return "Users created successfully"
        },
        error: formatToastError,
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
      icon={isEdit ? IconEdit : IconPlus}
      title={isEdit ? "Edit User" : "Create Users"}
      description={
        isEdit
          ? `Update the user account details for ${user.name ?? user.external_id}.`
          : "Create one or more user accounts in Kamino."
      }
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        {isEdit ? (
          <UserDialogEditForm form={form} />
        ) : (
          <UserDialogCreateForm
            form={form}
            groupItems={groupItems}
            groupOptionMap={groupOptionMap}
            mode={mode}
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
