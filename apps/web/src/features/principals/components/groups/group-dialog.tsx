import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Add01Icon,
  NotebookIcon,
  PencilEdit01Icon,
  RegexIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { Tabs, TabsTrigger } from "@workspace/ui/components/tabs"
import type {
  ApiBulkCreateResponse,
  ApiPrincipal,
  CreateGroupInput,
} from "@/features/principals/types/principals-types"
import type { CreateMode } from "@/features/principals/components/groups/group-dialog-utils"
import {
  AppDialog,
  AppDialogHeaderTabs,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
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
        setResultSummary(() => result)
      }
    },
  })

  const form = useForm({
    defaultValues: getDefaultGroupFormValues(group),
    onSubmit: ({ value }) => {
      onOpenChange(false)

      if (isEdit) {
        const parsed = groupSchema.parse(value)
        showSingleMutationToast({
          title: "Updating group",
          name: parsed.name,
          promise: mutation.mutateAsync(parsed),
          successDescription: "Updated",
        })
        return
      }

      const payload = buildCreateGroups(mode, value)
      const createGroups = async (inputs: Array<CreateGroupInput>) => {
        const result = await mutation.mutateAsync(inputs)
        if (result === null) {
          throw new Error("Group creation returned no result")
        }
        return result
      }
      const groupItems = payload.map((input, index) => ({
        id: `${index}:${input.name}`,
        input,
      }))

      showUnitMutationToast({
        title: "Creating groups",
        units: groupItems.map(({ id, input }) => ({
          items: [
            {
              id,
              name: input.name,
              successDescription: "Created",
            },
          ],
          run: async () => {
            const result = await createGroups([input])
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
    form.reset(getDefaultGroupFormValues(group))
    setMode("single")
  }, [form, group])

  const resetDialog = React.useCallback(() => {
    resetFields()
    setResultSummary(null)
  }, [resetFields])

  const dialogProps = {
    open,
    onOpenChange,
    onClosed: resetDialog,
    initialFocus: false as const,
    className: nestedDialogAnimationClassName,
    icon: isEdit ? PencilEdit01Icon : Add01Icon,
    title: isEdit ? "Edit Group" : "Create Groups",
    description: isEdit
      ? `Update the group account details for ${group.name ?? group.external_id}.`
      : "Create one or more groups in Kamino.",
  }

  const formContent = (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      {isEdit ? (
        <GroupDialogEditForm form={form} />
      ) : (
        <AppDialogScrollBody>
          <GroupDialogCreateForm form={form} />
        </AppDialogScrollBody>
      )}

      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton pending={isSubmitting}>
              {isEdit ? "Save" : "Create"}
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )

  const resultSummaryDialog = resultSummary ? (
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
  ) : null

  if (isEdit) {
    return (
      <>
        <AppDialog {...dialogProps}>{formContent}</AppDialog>
        {resultSummaryDialog}
      </>
    )
  }

  return (
    <>
      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as CreateMode)}
        className="gap-0"
      >
        <AppDialog
          {...dialogProps}
          headerAfter={
            <AppDialogHeaderTabs>
              <TabsTrigger value="single">
                <HugeiconsIcon icon={UserGroupIcon} />
                Single
              </TabsTrigger>
              <TabsTrigger value="list">
                <HugeiconsIcon icon={NotebookIcon} />
                List
              </TabsTrigger>
              <TabsTrigger value="prefix">
                <HugeiconsIcon icon={RegexIcon} />
                Prefix
              </TabsTrigger>
            </AppDialogHeaderTabs>
          }
        >
          {formContent}
        </AppDialog>
      </Tabs>
      {resultSummaryDialog}
    </>
  )
}
