import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconEdit, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import type {
  ApiBulkCreateResponse,
  ApiPrincipal,
  CreateGroupInput,
} from "@/features/principals/types/principals-types"
import type { CreateMode } from "@/features/principals/components/groups/group-dialog-utils"
import {
  AppDialog,
  AppDialogPrimaryButton,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import { BulkCreateResultsSummary } from "@/features/principals/components/create-results-summary"
import {
  createGroup,
  updateGroup,
} from "@/features/principals/api/principals-api"
import { GroupDialogCreateForm } from "@/features/principals/components/groups/group-dialog-create-form"
import { GroupDialogEditForm } from "@/features/principals/components/groups/group-dialog-edit-form"
import {
  buildCreateGroups,
  getDefaultGroupFormValues,
  groupSchema,
  normalizeDescription,
} from "@/features/principals/components/groups/group-dialog-utils"
import { formatToastError } from "@/features/shared/utils/format"

export function GroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!group
  const queryClient = useQueryClient()
  const [mode, setMode] = React.useState<CreateMode>("single")
  const [resultSummary, setResultSummary] =
    React.useState<ApiBulkCreateResponse | null>(null)

  const mutation = useMutation({
    mutationFn: async (
      values: Array<CreateGroupInput> | ReturnType<typeof groupSchema.parse>
    ) => {
      if (isEdit) {
        const parsed = values as ReturnType<typeof groupSchema.parse>
        await updateGroup(group.id, {
          name: parsed.name,
          description: normalizeDescription(parsed.description ?? ""),
        })
        return null
      }

      return createGroup(values as Array<CreateGroupInput>)
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
    defaultValues: getDefaultGroupFormValues(group),
    onSubmit: ({ value }) => {
      onOpenChange(false)

      if (isEdit) {
        const parsed = groupSchema.parse(value)
        toast.promise(mutation.mutateAsync(parsed), {
          loading: "Updating group...",
          success: "Group updated",
          error: formatToastError,
        })
        return
      }

      const payload = buildCreateGroups(mode, value)
      toast.promise(mutation.mutateAsync(payload), {
        loading: "Creating groups...",
        success: (result) => {
          if (result && result.failures.length > 0) {
            return `Created ${result.successful} group${result.successful === 1 ? "" : "s"} with some failures`
          }
          return "Groups created successfully"
        },
        error: formatToastError,
      })
    },
  })

  const resetFields = React.useCallback(() => {
    form.reset(getDefaultGroupFormValues(group))
    setMode("single")
  }, [form, group])

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
      title={isEdit ? "Edit Group" : "Create Groups"}
      description={
        isEdit
          ? `Update the group account details for ${group.name ?? group.external_id}.`
          : "Create one or more groups in Kamino."
      }
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        {isEdit ? (
          <GroupDialogEditForm form={form} />
        ) : (
          <GroupDialogCreateForm form={form} mode={mode} setMode={setMode} />
        )}

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save"
                    : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>

      {resultSummary ? (
        <BulkCreateResultsSummary
          entityLabel="group"
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
