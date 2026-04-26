"use client"

import { useMemo } from "react"
import { IconEdit, IconFolderPlus } from "@tabler/icons-react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"

import { DialogFooter } from "@workspace/ui/components/dialog"
import { Field, FieldError, FieldGroup } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { formatVmReference } from "@/features/shared/utils/utils"
import { useRenameVM } from "@/features/vms/hooks/use-vm-actions"
import { vmNameSchema } from "@/features/vms/utils/vm-name"

import {
  useCreateFolder,
  useRenameFolder,
} from "../hooks/use-inventory-actions"

const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(63, "Name must be 63 characters or less")
  .regex(/^[a-zA-Z]/, "Name must start with a letter")
  .regex(
    /^[a-zA-Z0-9-]+$/,
    "Name can only contain letters, numbers, and hyphens"
  )

type RenameDialogProps =
  | {
      mode: "create-folder"
      open: boolean
      onOpenChange: (open: boolean) => void
      parentId: string
    }
  | {
      mode: "rename-folder"
      open: boolean
      onOpenChange: (open: boolean) => void
      folderId: string
      currentName: string
    }
  | {
      mode: "rename-item"
      open: boolean
      onOpenChange: (open: boolean) => void
      itemId: string
      currentName: string
      currentVmid?: number
    }

export function RenameDialog(props: RenameDialogProps) {
  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()
  const renameVm = useRenameVM()
  const currentName = props.mode === "create-folder" ? "" : props.currentName

  const ui = useMemo(() => {
    switch (props.mode) {
      case "create-folder":
        return {
          title: "New Folder",
          description: "Enter a name for the new folder.",
          submitLabel: "Create Folder",
          pendingLabel: "Creating...",
          placeholder: "Folder",
          icon: IconFolderPlus,
          schema: folderNameSchema,
        }
      case "rename-folder":
        return {
          title: "Rename Folder",
          description: `Enter a new name for folder "${props.currentName}".`,
          submitLabel: "Rename Folder",
          pendingLabel: "Renaming...",
          placeholder: "Folder",
          icon: IconEdit,
          schema: folderNameSchema,
        }
      case "rename-item":
        return {
          title: "Rename",
          description: `Enter a new name for ${formatVmReference(
            props.currentVmid,
            props.currentName
          )}.`,
          submitLabel: "Rename",
          pendingLabel: "Renaming...",
          placeholder: "Name",
          icon: IconEdit,
          schema: vmNameSchema,
        }
    }
  }, [props])

  const form = useForm({
    defaultValues: { name: currentName },
    onSubmit: ({ value }) => {
      const parsed = ui.schema.parse(value.name)
      props.onOpenChange(false)

      if (props.mode === "create-folder") {
        toast.promise(
          createFolder.mutateAsync({ name: parsed, parentId: props.parentId }),
          {
            loading: `Creating folder "${parsed}"...`,
            success: `Folder "${parsed}" created`,
            error: (error: Error) => error.message,
          }
        )
      } else if (props.mode === "rename-folder") {
        toast.promise(
          renameFolder.mutateAsync({ id: props.folderId, name: parsed }),
          {
            loading: `Renaming folder to "${parsed}"...`,
            success: `Folder renamed to "${parsed}"`,
            error: (error: Error) => error.message,
          }
        )
      } else {
        toast.promise(
          renameVm.mutateAsync({ itemId: props.itemId, name: parsed }),
          {
            loading: `Renaming ${props.currentVmid ? `VM ${props.currentVmid}` : "VM"} to "${parsed}"...`,
            success: props.currentVmid
              ? `VM ${props.currentVmid} renamed to "${parsed}"`
              : `VM renamed to "${parsed}"`,
            error: (error: Error) => error.message,
          }
        )
      }
    },
  })

  const Icon = ui.icon

  return (
    <AppDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={currentName ? true : false}
      icon={Icon}
      title={ui.title}
      description={ui.description}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) => {
                const result = ui.schema.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0]?.message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <Input
                  id="name"
                  placeholder={ui.placeholder}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? ui.pendingLabel : ui.submitLabel}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
