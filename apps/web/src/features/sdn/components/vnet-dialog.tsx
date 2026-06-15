import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconEdit, IconPlus } from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { formatToastError } from "@/features/shared/utils/format"
import { isTouchedInvalid } from "@/components/forms/form-errors"
import { createVNet, updateVNet } from "@/features/sdn/api/sdn-api"

const vnetSchema = z.object({
  vnet: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Must start with a letter, alphanumeric/dash/underscore only"
    ),
  zone: z.string().trim().min(1, "Zone is required"),
  tag: z.string().trim(),
  alias: z.string().trim().max(256),
})

export function VNetDialog({
  vnet,
  open,
  onOpenChange,
}: {
  vnet?: ApiVNet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!vnet
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof vnetSchema>) => {
      const tag = values.tag ? parseInt(values.tag, 10) : undefined
      if (isEdit) {
        await updateVNet(vnet.vnet, {
          zone: values.zone || undefined,
          tag,
          alias: values.alias || undefined,
        })
      } else {
        await createVNet({
          vnet: values.vnet,
          zone: values.zone,
          tag,
          alias: values.alias || undefined,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
      form.reset()
    },
  })

  const form = useForm({
    defaultValues: {
      vnet: vnet?.vnet ?? "",
      zone: vnet?.zone ?? "",
      tag: vnet?.tag?.toString() ?? "",
      alias: vnet?.alias ?? "",
    },
    validators: {
      onSubmit: vnetSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = vnetSchema.parse(value)
      onOpenChange(false)
      toast.promise(mutation.mutateAsync(parsed), {
        loading: isEdit ? "Updating VNet..." : "Creating VNet...",
        success: isEdit ? "VNet updated" : "VNet created",
        error: formatToastError,
      })
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={isEdit ? IconEdit : IconPlus}
      title={isEdit ? "Edit VNet" : "Create VNet"}
      description={
        isEdit
          ? `Update the virtual network configuration for ${vnet.vnet}.`
          : "Create a new SDN virtual network."
      }
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="vnet">
            {(field) => {
              const isInvalid =
                isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="vnet">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="vnet"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      disabled={isEdit}
                      placeholder="myvnet"
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="zone">
            {(field) => {
              const isInvalid =
                isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="zone">Zone</FieldLabel>
                  <FieldContent>
                    <Input
                      id="zone"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="localzone"
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="tag">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="tag">VLAN Tag</FieldLabel>
                <FieldContent>
                  <Input
                    id="tag"
                    type="number"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Optional"
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="alias">
            {(field) => {
              const isInvalid =
                isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="alias">Alias</FieldLabel>
                  <FieldContent>
                    <Input
                      id="alias"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="Optional description"
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton
                pending={isSubmitting}
                pendingLabel={isEdit ? "Saving..." : "Creating..."}
              >
                {isEdit ? "Save" : "Create VNet"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
