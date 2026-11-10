import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  folderLimitFormSchema,
  formatLimitValue,
  parseLimit,
} from "@/lib/inventory/folder-limit-form"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { GaugeIcon } from "@hugeicons/core-free-icons"
import { Input } from "@workspace/ui/components/input"
import { isTouchedInvalid } from "@/lib/forms/form-errors"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useForm } from "@tanstack/react-form"
import { useUpdateFolderVmLimit } from "../../hooks/inventory/use-inventory-actions"

type FolderLimitDialogProps = {
  directVmLimit?: number | null
  effectiveVmLimit?: number | null
  folderId: string
  folderName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  vmCount?: number | null
}

export function FolderLimitDialog({
  directVmLimit,
  effectiveVmLimit,
  folderId,
  folderName,
  open,
  onOpenChange,
}: FolderLimitDialogProps) {
  const updateLimit = useUpdateFolderVmLimit()
  const inheritedLimit =
    directVmLimit == null && effectiveVmLimit != null ? effectiveVmLimit : null

  const form = useForm({
    defaultValues: {
      limit: formatLimitValue(directVmLimit),
    },
    validators: {
      onSubmit: folderLimitFormSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = parseLimit(value.limit)
      if (parsed === undefined) {
        return
      }

      onOpenChange(false)
      showSingleMutationToast({
        title: "Updating limit",
        name: folderName,
        promise: updateLimit.mutateAsync({ id: folderId, vmLimit: parsed }),
        successDescription: "Limit updated",
      })
    },
  })

  function reset() {
    form.reset()
    form.setFieldValue("limit", formatLimitValue(directVmLimit))
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={reset}
      icon={GaugeIcon}
      title="Folder Limit"
      description={`Set the limit for "${folderName}".`}
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="limit">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    VM/template limit
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    inputMode="numeric"
                    min={1}
                    placeholder={
                      inheritedLimit == null
                        ? "No limit"
                        : String(inheritedLimit)
                    }
                    type="number"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    aria-errormessage={
                      isInvalid ? "folder-limit-error" : undefined
                    }
                  />
                  {isInvalid && (
                    <FieldError
                      id="folder-limit-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <AppDialogPrimaryButton
            pending={updateLimit.isPending}
            disabled={updateLimit.isPending}
            aria-busy={updateLimit.isPending || undefined}
          >
            Save Limit
          </AppDialogPrimaryButton>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
