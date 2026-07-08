"use client"

import { useMemo } from "react"
import { FolderAddIcon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"

import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  useCreateFolder,
  useRenameFolder,
} from "../hooks/use-inventory-actions"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { isTouchedInvalid } from "@/components/forms/form-errors"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { formatVmReference } from "@/features/shared/utils/format"
import { replaceWhitespaceWithHyphen } from "@/features/shared/utils/sanitize"
import { useRenameVM } from "@/features/vms/hooks/use-vm-actions"
import { vmNameSchema } from "@/features/vms/utils/vm-name"

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

const folderDescriptionSchema = z
  .string()
  .trim()
  .max(256, "Max 256 characters")

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
  const currentName = props.mode === "create-folder" ? "" : props.currentName
  const currentDescription =
    props.mode === "rename-folder" ? (props.currentDescription ?? "") : ""

  const ui = useMemo(() => {
    switch (props.mode) {
      case "create-folder":
        return {
          title: "New Folder",
          description: "Enter a name for the new folder.",
          submitLabel: "Create Folder",
          pendingLabel: "Creating...",
          placeholder: "Folder",
          icon: FolderAddIcon,
          schema: folderNameSchema,
        }
      case "rename-folder":
        return {
          title: "Edit Folder",
          description: `Update the name and description for folder "${props.currentName}".`,
          submitLabel: "Save Folder",
          pendingLabel: "Saving...",
          placeholder: "Folder",
          icon: PencilEdit01Icon,
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
          icon: PencilEdit01Icon,
          schema: vmNameSchema,
        }
    }
  }, [props])

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
          promise: renameVm.mutateAsync({ itemId: props.itemId, name: parsedName }),
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
      initialFocus={currentName ? true : false}
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
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
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
                pendingLabel={ui.pendingLabel}
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
