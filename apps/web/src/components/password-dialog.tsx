"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
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
import { IconKey } from "@tabler/icons-react"
import { setUserPassword } from "@/lib/queries"

const passwordSchema = z
  .object({
    password: z.string().min(8, "Minimum 8 characters"),
    confirm: z.string().min(1, "Please confirm the password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })

export function PasswordDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useMutation({
    mutationFn: async (password: string) => {
      await setUserPassword(userId, password)
    },
    onSuccess: () => {
      toast.success("Password updated")
      onOpenChange(false)
      form.reset()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value }) => {
      const parsed = passwordSchema.parse(value)
      await mutation.mutateAsync(parsed.password)
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
          <DialogTitle>Set Password</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{userName}</strong>.
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
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  const result = z
                    .string()
                    .min(8, "Minimum 8 characters")
                    .safeParse(value)
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
                  <FieldLabel htmlFor="password">New Password</FieldLabel>
                  <FieldContent>
                    <Input
                      id="password"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="confirm"
              validators={{
                onBlur: ({ value, fieldApi }) => {
                  const pw = fieldApi.form.getFieldValue("password")
                  if (value && pw && value !== pw) {
                    return "Passwords do not match"
                  }
                  return undefined
                },
              }}
            >
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="confirm">Confirm Password</FieldLabel>
                  <FieldContent>
                    <Input
                      id="confirm"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconKey data-icon="inline-start" />
                  {isSubmitting ? "Setting..." : "Set Password"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
