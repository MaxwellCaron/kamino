import { useForm } from "@tanstack/react-form"
import { GaugeIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { z } from "zod"

import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { useUpdateFolderVmLimit } from "../hooks/use-inventory-actions"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { isTouchedInvalid } from "@/components/forms/form-errors"
import { formatToastError } from "@/features/shared/utils/format"

type FolderLimitDialogProps = {
  directVmLimit?: number | null
  effectiveVmLimit?: number | null
  folderId: string
  folderName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  vmCount?: number | null
}

function formatLimitValue(directVmLimit?: number | null) {
  return directVmLimit == null ? "" : String(directVmLimit)
}

function parseLimit(value: string) {
  const trimmed = value.trim()
  if (trimmed === "") return null

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

const folderLimitFormSchema = z.object({
  limit: z
    .string()
    .refine(
      (value) => parseLimit(value) !== undefined,
      "Limit must be a whole number greater than zero."
    ),
})

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
      toast.promise(
        updateLimit.mutateAsync({ id: folderId, vmLimit: parsed }),
        {
          loading: `Updating limit for "${folderName}"...`,
          success: `Limit updated for "${folderName}"`,
          error: formatToastError,
        }
      )
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
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <AppDialogPrimaryButton
            pending={updateLimit.isPending}
            pendingLabel="Saving..."
          >
            Save Limit
          </AppDialogPrimaryButton>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
