import { useState } from "react"
import { IconGauge } from "@tabler/icons-react"
import { toast } from "sonner"

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

function parseLimit(value: string) {
  const trimmed = value.trim()
  if (trimmed === "") return null

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
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
  const [value, setValue] = useState(
    directVmLimit == null ? "" : String(directVmLimit)
  )
  const [error, setError] = useState<string | null>(null)
  const inheritedLimit =
    directVmLimit == null && effectiveVmLimit != null ? effectiveVmLimit : null

  function reset() {
    setValue(directVmLimit == null ? "" : String(directVmLimit))
    setError(null)
  }

  function submit() {
    const parsed = parseLimit(value)
    if (parsed === undefined) {
      setError("Limit must be a whole number greater than zero.")
      return
    }

    onOpenChange(false)
    toast.promise(updateLimit.mutateAsync({ id: folderId, vmLimit: parsed }), {
      loading: `Updating limit for "${folderName}"...`,
      success: `Limit updated for "${folderName}"`,
      error: formatToastError,
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={reset}
      icon={IconGauge}
      title="Folder Limit"
      description={`Set the limit for "${folderName}".`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="vm-limit">VM/template limit</FieldLabel>
            <Input
              id="vm-limit"
              inputMode="numeric"
              min={1}
              placeholder={
                inheritedLimit == null ? "No limit" : String(inheritedLimit)
              }
              type="number"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              aria-invalid={error ? true : undefined}
            />
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <AppDialogPrimaryButton disabled={updateLimit.isPending}>
            {updateLimit.isPending ? "Saving..." : "Save Limit"}
          </AppDialogPrimaryButton>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
