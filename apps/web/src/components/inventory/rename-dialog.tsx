"use client"

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
import { FolderAddIcon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import {
  folderDescriptionSchema,
  folderNameSchema,
} from "@/lib/inventory/folder-form"
import {
  useCreateFolder,
  useRenameFolder,
} from "../../hooks/inventory/use-inventory-actions"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { formatVmReference } from "@/lib/vms/vm-reference"
import { isTouchedInvalid } from "@/lib/forms/form-errors"
import { replaceWhitespaceWithHyphen } from "@/lib/forms/sanitize"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useForm } from "@tanstack/react-form"
import { useMemo } from "react"
import { useRenameVM } from "@/hooks/vms/use-vm-actions"
import { vmNameSchema } from "@/lib/vms/vm-name"
import { z } from "zod"

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
      currentDescription?: string | null
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
  const mode = props.mode
  const currentName = mode === "create-folder" ? "" : props.currentName
  const currentDescription =
    mode === "rename-folder" ? (props.currentDescription ?? "") : ""
  const currentVmid = mode === "rename-item" ? props.currentVmid : undefined

  const ui = useMemo(() => {
    switch (mode) {
      case "create-folder":
        return {
          title: "New Folder",
          description: "Enter a name for the new folder.",
          submitLabel: "Create Folder",
          placeholder: "Folder",
          icon: FolderAddIcon,
          schema: folderNameSchema,
        }
      case "rename-folder":
        return {
          title: "Edit Folder",
          description: `Update the name and description for folder "${currentName}".`,
          submitLabel: "Save Folder",
          placeholder: "Folder",
          icon: PencilEdit01Icon,
          schema: folderNameSchema,
        }
      case "rename-item":
        return {
          title: "Rename",
          description: `Enter a new name for ${formatVmReference(
            currentVmid,
            currentName
          )}.`,
          submitLabel: "Rename",
          placeholder: "Name",
          icon: PencilEdit01Icon,
          schema: vmNameSchema,
        }
    }
  }, [currentName, currentVmid, mode])

  const form = useForm({
    defaultValues: { name: currentName, description: currentDescription },
    validators: {
      onSubmit: z.object({
        name: ui.schema,
        description: folderDescriptionSchema,
      }),
    },
    onSubmit: ({ value }) => {
      const parsedName = ui.schema.parse(value.name)
      const parsedDescription = folderDescriptionSchema.parse(value.description)
      props.onOpenChange(false)

      if (props.mode === "create-folder") {
        showSingleMutationToast({
          title: "Creating",
          name: parsedName,
          promise: createFolder.mutateAsync({
            name: parsedName,
            parentId: props.parentId,
          }),
          successDescription: "Created",
        })
      } else if (props.mode === "rename-folder") {
        showSingleMutationToast({
          title: "Saving",
          name: parsedName,
          promise: renameFolder.mutateAsync({
            id: props.folderId,
            name: parsedName,
            description: parsedDescription,
          }),
          successDescription: "Saved",
        })
      } else {
        showSingleMutationToast({
          title: "Renaming",
          name: parsedName,
          promise: renameVm.mutateAsync({
            itemId: props.itemId,
            name: parsedName,
          }),
          successDescription: "Renamed",
        })
      }
    },
  })

  const Icon = ui.icon

  return (
    <AppDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onClosed={() => form.reset()}
      icon={Icon}
      title={ui.title}
      description={ui.description}
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="name">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    placeholder={ui.placeholder}
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(
                        replaceWhitespaceWithHyphen(event.target.value)
                      )
                    }
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    aria-errormessage={
                      isInvalid ? "inventory-name-error" : undefined
                    }
                  />
                  {isInvalid && (
                    <FieldError
                      id="inventory-name-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </Field>
              )
            }}
          </form.Field>
          {props.mode === "rename-folder" && (
            <form.Field name="description">
              {(field) => {
                const isInvalid = isTouchedInvalid(field.state.meta)

                return (
                  <CountedTextareaField
                    id="description"
                    label="Description"
                    placeholder="Optional folder purpose"
                    isInvalid={isInvalid}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                    maxLength={256}
                    errors={isInvalid ? field.state.meta.errors : []}
                  />
                )
              }}
            </form.Field>
          )}
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton
                pending={isSubmitting}
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
              >
                {ui.submitLabel}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
