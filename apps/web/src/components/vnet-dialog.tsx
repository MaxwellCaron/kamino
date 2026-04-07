import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
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
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { IconDeviceFloppy, IconPlus } from "@tabler/icons-react"
import type { ApiVNet } from "@/lib/queries"
import { createVNet, updateVNet } from "@/lib/queries"

const vnetSchema = z.object({
  vnet: z
    .string()
    .min(1, "Name is required")
    .max(64)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Must start with a letter, alphanumeric/dash/underscore only"
    ),
  zone: z.string().min(1, "Zone is required"),
  tag: z.string().optional(),
  alias: z.string().max(256).optional(),
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
      toast.success(isEdit ? "VNet updated" : "VNet created")
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
      onOpenChange(false)
      form.reset()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const form = useForm({
    defaultValues: {
      vnet: vnet?.vnet ?? "",
      zone: vnet?.zone ?? "",
      tag: vnet?.tag?.toString() ?? "",
      alias: vnet?.alias ?? "",
    },
    onSubmit: async ({ value }) => {
      const parsed = vnetSchema.parse(value)
      await mutation.mutateAsync(parsed)
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit VNet" : "Create VNet"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the virtual network configuration."
              : "Create a new SDN virtual network."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="vnet"
              validators={{
                onBlur: ({ value }) => {
                  const result = vnetSchema.shape.vnet.safeParse(value)
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
                  <FieldLabel htmlFor="vnet">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="vnet"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      disabled={isEdit}
                      placeholder="myvnet"
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="zone"
              validators={{
                onBlur: ({ value }) => {
                  const result = vnetSchema.shape.zone.safeParse(value)
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
                  <FieldLabel htmlFor="zone">Zone</FieldLabel>
                  <FieldContent>
                    <Input
                      id="zone"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="localzone"
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
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
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="alias">Alias</FieldLabel>
                  <FieldContent>
                    <Input
                      id="alias"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="Optional description"
                    />
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isEdit ? (
                    <IconDeviceFloppy data-icon="inline-start" />
                  ) : (
                    <IconPlus data-icon="inline-start" />
                  )}
                  {isSubmitting
                    ? isEdit
                      ? "Saving..."
                      : "Creating..."
                    : isEdit
                      ? "Save"
                      : "Create VNet"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
