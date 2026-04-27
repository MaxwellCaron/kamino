import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  IconEdit,
  IconNotes,
  IconPlus,
  IconRegex,
  IconUsersGroup,
} from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
  ApiBulkCreateResponse,
  ApiPrincipal,
  CreateGroupInput,
} from "@/features/principals/types/principals-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import { BulkCreateResultsSummary } from "@/features/principals/components/create-results-summary"
import {
  createGroup,
  updateGroup,
} from "@/features/principals/api/principals-api"
import { formatToastError } from "@/features/shared/utils/format"

const groupNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(64, "Max 64 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only")

const descriptionSchema = z.string().max(256, "Max 256 characters").optional()

const groupSchema = z.object({
  name: groupNameSchema,
  description: descriptionSchema,
})

type CreateMode = "single" | "list" | "prefix"

type GroupFormValues = {
  description: string
  listInput: string
  name: string
  prefix: string
  prefixDescription: string
  quantity: string
  start: string
}

function getDefaultGroupFormValues(group?: ApiPrincipal): GroupFormValues {
  return {
    name: group?.name ?? "",
    description: group?.description ?? "",
    listInput: "",
    prefix: "",
    start: "1",
    quantity: "10",
    prefixDescription: "",
  }
}

function normalizeDescription(description: string) {
  const value = description.trim()
  return value.length > 0 ? value : undefined
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive whole number`)
  }
  return parsed
}

function validateDescription(value: string) {
  const result = descriptionSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0].message
}

function buildCreateGroupInput(args: {
  context: string
  description: string
  name: string
}): CreateGroupInput {
  const nameResult = groupNameSchema.safeParse(args.name.trim())
  if (!nameResult.success) {
    throw new Error(`${args.context}: ${nameResult.error.issues[0].message}`)
  }

  const description = normalizeDescription(args.description)
  const descriptionResult = descriptionSchema.safeParse(description)
  if (!descriptionResult.success) {
    throw new Error(
      `${args.context}: ${descriptionResult.error.issues[0].message}`
    )
  }

  return {
    name: nameResult.data,
    description: descriptionResult.data,
  }
}

function buildCreateGroups(
  mode: CreateMode,
  values: GroupFormValues
): Array<CreateGroupInput> {
  if (mode === "single") {
    return [
      buildCreateGroupInput({
        context: "Single group",
        name: values.name,
        description: values.description,
      }),
    ]
  }

  if (mode === "list") {
    const lines = values.listInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      throw new Error("Provide at least one group")
    }

    return lines.map((line, index) => {
      const parts = line.split(",")
      return buildCreateGroupInput({
        context: `Line ${index + 1}`,
        name: parts[0] ?? "",
        description: parts.slice(1).join(","),
      })
    })
  }

  const prefix = values.prefix.trim()
  if (!prefix) {
    throw new Error("Prefix is required")
  }

  const start = parsePositiveInteger(values.start, "Starting number")
  const quantity = parsePositiveInteger(values.quantity, "Quantity")
  const width = Math.max(2, String(start + quantity - 1).length)

  return Array.from({ length: quantity }, (_, offset) => {
    const index = start + offset
    return buildCreateGroupInput({
      context: `Generated group ${offset + 1}`,
      name: `${prefix}${String(index).padStart(width, "0")}`,
      description: values.prefixDescription,
    })
  })
}

export function GroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!group
  const queryClient = useQueryClient()
  const [mode, setMode] = React.useState<CreateMode>("single")
  const [resultSummary, setResultSummary] =
    React.useState<ApiBulkCreateResponse | null>(null)

  const mutation = useMutation({
    mutationFn: async (
      values: Array<CreateGroupInput> | z.infer<typeof groupSchema>
    ) => {
      if (isEdit) {
        const parsed = values as z.infer<typeof groupSchema>
        await updateGroup(group.id, {
          name: parsed.name,
          description: normalizeDescription(parsed.description ?? ""),
        })
        return null
      }

      return createGroup(values as Array<CreateGroupInput>)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["principals"] })

      if (isEdit || result === null) {
        return
      }

      if (result.failures.length > 0) {
        if (result.successful > 0) {
          toast.success(
            `Successfully created ${result.successful} group${result.successful === 1 ? "" : "s"}`
          )
        }
        setResultSummary(result)
      } else {
        toast.success(
          `Successfully created ${result.successful} group${result.successful === 1 ? "" : "s"}`
        )
      }
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

  const form = useForm({
    defaultValues: getDefaultGroupFormValues(group),
    onSubmit: ({ value }) => {
      onOpenChange(false)

      if (isEdit) {
        const parsed = groupSchema.parse(value)
        toast.promise(mutation.mutateAsync(parsed), {
          loading: "Updating group...",
          success: "Group updated",
          error: formatToastError,
        })
        return
      }

      const payload = buildCreateGroups(mode, value)
      toast.promise(mutation.mutateAsync(payload), {
        loading: "Creating groups...",
        success: (result) => {
          if (result && result.failures.length > 0) {
            return `Created ${result.successful} group${result.successful === 1 ? "" : "s"} with some failures`
          }
          return "Groups created successfully"
        },
        error: formatToastError,
      })
    },
  })

  const resetFields = React.useCallback(() => {
    form.reset(getDefaultGroupFormValues(group))
    setMode("single")
  }, [form, group])

  const resetDialog = React.useCallback(() => {
    resetFields()
    setResultSummary(null)
  }, [resetFields])

  React.useEffect(() => {
    if (!open) return

    resetFields()
    setResultSummary(null)
  }, [open, resetFields])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={resetDialog}
      initialFocus={false}
      className={nestedDialogAnimationClassName}
      icon={isEdit ? IconEdit : IconPlus}
      title={isEdit ? "Edit Group" : "Create Groups"}
      description={
        isEdit
          ? `Update the group account details for ${group.name ?? group.external_id}.`
          : "Create one or more groups in Kamino."
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        {isEdit ? (
          <FieldGroup>
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  const result = groupNameSchema.safeParse(value)
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
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="name"
                      maxLength={64}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      placeholder="Admins"
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onBlur: ({ value }) => validateDescription(value),
              }}
            >
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="description"
                      maxLength={256}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      placeholder="Optional description"
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                  </FieldContent>
                  <FieldDescription className="text-right font-mono text-xs">
                    {field.state.value.length}/256
                  </FieldDescription>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        ) : (
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as CreateMode)}
            className="gap-4"
          >
            <TabsList className="w-full border-b" variant="line">
              <TabsTrigger value="single">
                <IconUsersGroup />
                Single
              </TabsTrigger>
              <TabsTrigger value="list">
                <IconNotes />
                List
              </TabsTrigger>
              <TabsTrigger value="prefix">
                <IconRegex />
                Prefix
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <FieldGroup>
                <form.Field
                  name="name"
                  validators={{
                    onBlur: ({ value }) => {
                      const result = groupNameSchema.safeParse(value)
                      return result.success
                        ? undefined
                        : result.error.issues[0].message
                    },
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor="single-name">Name</FieldLabel>
                      <FieldContent>
                        <Input
                          id="single-name"
                          maxLength={64}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                          placeholder="Admins"
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                        />
                      </FieldContent>
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </form.Field>

                <form.Field
                  name="description"
                  validators={{
                    onBlur: ({ value }) => validateDescription(value),
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor="single-description">
                        Description
                      </FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="single-description"
                          maxLength={256}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                          placeholder="Optional description"
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                        />
                      </FieldContent>
                      <FieldDescription className="text-right font-mono text-xs">
                        {field.state.value.length}/256
                      </FieldDescription>
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="list">
              <FieldGroup>
                <form.Field name="listInput">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="list-input">Group List</FieldLabel>
                      <FieldContent>
                        <Textarea
                          className="font-mono"
                          id="list-input"
                          rows={8}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          placeholder={
                            "admins,Administrative group\noperators,Operations team"
                          }
                        />
                      </FieldContent>
                      <FieldDescription>
                        One group per line in{" "}
                        <span className="font-mono text-xs">
                          name,description
                        </span>{" "}
                        format. The description is optional.
                      </FieldDescription>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="prefix">
              <FieldGroup>
                <form.Field
                  name="prefix"
                  validators={{
                    onBlur: ({ value }) =>
                      value.trim() ? undefined : "Prefix is required",
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor="prefix">Prefix</FieldLabel>
                      <FieldContent>
                        <Input
                          id="prefix"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                          placeholder="team"
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                        />
                      </FieldContent>
                      <FieldDescription>
                        Generated group names use the prefix plus a padded
                        number. i.e. team01, team02, team03.
                      </FieldDescription>
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </form.Field>

                <div className="grid grid-cols-2 gap-6">
                  <form.Field
                    name="start"
                    validators={{
                      onBlur: ({ value }) =>
                        (() => {
                          try {
                            parsePositiveInteger(value, "Starting number")
                            return undefined
                          } catch (error) {
                            return error instanceof Error
                              ? error.message
                              : "Starting number is invalid"
                          }
                        })(),
                    }}
                  >
                    {(field) => (
                      <Field
                        data-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <FieldLabel htmlFor="start">Starting Number</FieldLabel>
                        <FieldContent>
                          <Input
                            id="start"
                            min={1}
                            step={1}
                            type="number"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          />
                        </FieldContent>
                        <FieldError>{field.state.meta.errors[0]}</FieldError>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="quantity"
                    validators={{
                      onBlur: ({ value }) =>
                        (() => {
                          try {
                            parsePositiveInteger(value, "Quantity")
                            return undefined
                          } catch (error) {
                            return error instanceof Error
                              ? error.message
                              : "Quantity is invalid"
                          }
                        })(),
                    }}
                  >
                    {(field) => (
                      <Field
                        data-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
                        <FieldContent>
                          <Input
                            id="quantity"
                            min={1}
                            step={1}
                            type="number"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          />
                        </FieldContent>
                        <FieldError>{field.state.meta.errors[0]}</FieldError>
                      </Field>
                    )}
                  </form.Field>
                </div>

                <form.Field
                  name="prefixDescription"
                  validators={{
                    onBlur: ({ value }) => validateDescription(value),
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor="prefix-description">
                        Description
                      </FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="prefix-description"
                          maxLength={256}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                          placeholder="Optional shared description"
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                        />
                      </FieldContent>
                      <FieldDescription className="text-right font-mono text-xs">
                        {field.state.value.length}/256
                      </FieldDescription>
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save"
                    : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>

      {resultSummary ? (
        <BulkCreateResultsSummary
          entityLabel="group"
          open={true}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setResultSummary(null)
            }
          }}
          result={resultSummary}
        />
      ) : null}
    </AppDialog>
  )
}
