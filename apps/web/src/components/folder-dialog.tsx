import { useForm } from "@tanstack/react-form"
import { IconEdit, IconFolderPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { useCreateFolder, useRenameFolder } from "@/hooks/use-inventory-actions"

const folderSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(63, "Name must be 63 characters or less"),
})

type FolderDialogProps = {
  mode: "create" | "rename"
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName?: string
  folderId?: string
  parentId?: string
}

export function FolderDialog({
  mode,
  open,
  onOpenChange,
  currentName = "",
  folderId,
  parentId,
}: FolderDialogProps) {
  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()

  const form = useForm({
    defaultValues: { name: currentName },
    onSubmit: ({ value }) => {
      const parsed = folderSchema.parse(value)

      if (mode === "create") {
        if (!parentId) return

        toast.promise(
          createFolder.mutateAsync({ name: parsed.name, parentId }),
          {
            loading: `Creating folder "${parsed.name}"...`,
            success: `Folder "${parsed.name}" created`,
            error: (error: Error) => error.message,
          }
        )
      } else {
        if (!folderId) return

        toast.promise(
          renameFolder.mutateAsync({ id: folderId, name: parsed.name }),
          {
            loading: `Renaming folder to "${parsed.name}"...`,
            success: `Folder renamed to "${parsed.name}"`,
            error: (error: Error) => error.message,
          }
        )
      }

      onOpenChange(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) form.reset()
      }}
    >
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Folder" : "Rename Folder"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Enter a name for the new folder."
              : "Enter a new name for this folder."}
          </DialogDescription>
        </DialogHeader>
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
                  const result = folderSchema.shape.name.safeParse(value)
                  return result.success
                    ? undefined
                    : result.error.issues[0].message
                },
              }}
            >
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="folder-name">Name</FieldLabel>
                  <Input
                    id="folder-name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {mode === "create" ? (
                    <IconFolderPlus data-icon="inline-start" />
                  ) : (
                    <IconEdit data-icon="inline-start" />
                  )}
                  {isSubmitting
                    ? mode === "create"
                      ? "Creating..."
                      : "Renaming..."
                    : mode === "create"
                      ? "Create Folder"
                      : "Rename Folder"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
