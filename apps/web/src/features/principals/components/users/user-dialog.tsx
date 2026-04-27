import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconEdit,
  IconNotes,
  IconPlus,
  IconRegex,
  IconUser,
} from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
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
  CreateUserInput,
} from "@/features/principals/types/principals-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"
import { BulkCreateResultsSummary } from "@/features/principals/components/create-results-summary"
import {
  createUser,
  groupsQueryOptions,
  setUserPassword,
  updateUser,
} from "@/features/principals/api/principals-api"
import { formatToastError } from "@/features/shared/utils/format"

const usernameSchema = z
  .string()
  .min(1, "Username is required")
  .max(20, "Max 20 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only")

const descriptionSchema = z.string().max(256, "Max 256 characters").optional()
const requiredPasswordSchema = z.string().min(8, "Minimum 8 characters")

const userSchema = z.object({
  username: usernameSchema,
  description: descriptionSchema,
  password: z.string().optional(),
})

type CreateMode = "single" | "list" | "prefix"

type UserFormValues = {
  description: string
  listInput: string
  password: string
  prefix: string
  prefixDescription: string
  quantity: string
  sharedPassword: string
  start: string
  username: string
}

function getDefaultUserFormValues(user?: ApiPrincipal): UserFormValues {
  return {
    username: user?.name ?? "",
    description: user?.description ?? "",
    password: "",
    listInput: "",
    prefix: "",
    start: "1",
    quantity: "10",
    sharedPassword: "",
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

function validateRequiredPassword(value: string) {
  const result = requiredPasswordSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0].message
}

function validateOptionalPassword(value: string) {
  if (!value) return undefined
  return validateRequiredPassword(value)
}

function buildCreateUserInput(args: {
  context: string
  description: string
  groupIds: Array<string>
  password: string
  username: string
}): CreateUserInput {
  const usernameResult = usernameSchema.safeParse(args.username.trim())
  if (!usernameResult.success) {
    throw new Error(
      `${args.context}: ${usernameResult.error.issues[0].message}`
    )
  }

  const passwordResult = requiredPasswordSchema.safeParse(args.password.trim())
  if (!passwordResult.success) {
    throw new Error(
      `${args.context}: ${passwordResult.error.issues[0].message}`
    )
  }

  const description = normalizeDescription(args.description)
  const descriptionResult = descriptionSchema.safeParse(description)
  if (!descriptionResult.success) {
    throw new Error(
      `${args.context}: ${descriptionResult.error.issues[0].message}`
    )
  }

  return {
    username: usernameResult.data,
    password: passwordResult.data,
    description: descriptionResult.data,
    group_ids: args.groupIds,
  }
}

function buildCreateUsers(
  mode: CreateMode,
  values: UserFormValues,
  selectedGroupIds: Array<string>
): Array<CreateUserInput> {
  if (mode === "single") {
    return [
      buildCreateUserInput({
        context: "Single user",
        username: values.username,
        password: values.password,
        description: values.description,
        groupIds: selectedGroupIds,
      }),
    ]
  }

  if (mode === "list") {
    const lines = values.listInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      throw new Error("Provide at least one user")
    }

    return lines.map((line, index) => {
      const parts = line.split(",")
      if (parts.length < 2) {
        throw new Error(
          `Line ${index + 1}: expected username,password,description`
        )
      }

      return buildCreateUserInput({
        context: `Line ${index + 1}`,
        username: parts[0] ?? "",
        password: parts[1] ?? "",
        description: parts.slice(2).join(","),
        groupIds: selectedGroupIds,
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
    return buildCreateUserInput({
      context: `Generated user ${offset + 1}`,
      username: `${prefix}${String(index).padStart(width, "0")}`,
      password: values.sharedPassword,
      description: values.prefixDescription,
      groupIds: selectedGroupIds,
    })
  })
}

function GroupAssignmentsField({
  id,
  groupItems,
  groupOptionMap,
  selectedGroupIds,
  setSelectedGroupIds,
}: {
  id: string
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  selectedGroupIds: Array<string>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}) {
  const anchor = useComboboxAnchor()

  return (
    <Field>
      <FieldLabel htmlFor={id}>Groups</FieldLabel>
      <FieldContent>
        <Combobox
          multiple
          autoHighlight
          items={groupItems}
          value={selectedGroupIds}
          onValueChange={(value) =>
            setSelectedGroupIds(Array.from(new Set(value)))
          }
        >
          <ComboboxChips ref={anchor} className="w-full">
            <ComboboxValue>
              {(values) => (
                <React.Fragment>
                  {(values as Array<string>).map((groupID) => (
                    <ComboboxChip key={groupID}>
                      {groupOptionMap.get(groupID) ?? groupID}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput id={id} placeholder="Assign groups..." />
                </React.Fragment>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No groups found.</ComboboxEmpty>
            <ComboboxList>
              {(groupID) => (
                <ComboboxItem key={groupID as string} value={groupID as string}>
                  {groupOptionMap.get(groupID as string) ?? (groupID as string)}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </FieldContent>
    </Field>
  )
}

export function UserDialog({
  user,
  open,
  onOpenChange,
}: {
  user?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!user
  const queryClient = useQueryClient()
  const groupsQuery = useQuery(groupsQueryOptions)
  const [mode, setMode] = React.useState<CreateMode>("single")
  const [resultSummary, setResultSummary] =
    React.useState<ApiBulkCreateResponse | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Array<string>>(
    []
  )

  const groupOptions = groupsQuery.data ?? []
  const groupOptionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groupOptions) {
      map.set(group.id, group.name ?? group.external_id)
    }
    return map
  }, [groupOptions])
  const groupItems = React.useMemo(
    () => Array.from(new Set(groupOptions.map((group) => group.id))),
    [groupOptions]
  )

  const mutation = useMutation({
    mutationFn: async (
      values: Array<CreateUserInput> | z.infer<typeof userSchema>
    ) => {
      if (isEdit) {
        const parsed = values as z.infer<typeof userSchema>
        await updateUser(user.id, {
          username: parsed.username,
          description: normalizeDescription(parsed.description ?? ""),
        })
        if (parsed.password) {
          await setUserPassword(user.id, parsed.password)
        }
        return null
      }

      return createUser(values as Array<CreateUserInput>)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["principals"] })

      if (isEdit || result === null) {
        return
      }

      if (result.failures.length > 0) {
        if (result.successful > 0) {
          toast.success(
            `Successfully created ${result.successful} user${result.successful === 1 ? "" : "s"}`
          )
        }
        setResultSummary(result)
      } else {
        toast.success(
          `Successfully created ${result.successful} user${result.successful === 1 ? "" : "s"}`
        )
      }
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

  const form = useForm({
    defaultValues: getDefaultUserFormValues(user),
    onSubmit: ({ value }) => {
      onOpenChange(false)

      if (isEdit) {
        const parsed = userSchema.parse(value)
        toast.promise(mutation.mutateAsync(parsed), {
          loading: "Updating user...",
          success: "User updated",
          error: formatToastError,
        })
        return
      }

      const payload = buildCreateUsers(mode, value, selectedGroupIds)
      toast.promise(mutation.mutateAsync(payload), {
        loading: "Creating users...",
        success: (result) => {
          if (result && result.failures.length > 0) {
            return `Created ${result.successful} user${result.successful === 1 ? "" : "s"} with some failures`
          }
          return "Users created successfully"
        },
        error: formatToastError,
      })
    },
  })

  const resetFields = React.useCallback(() => {
    form.reset(getDefaultUserFormValues(user))
    setMode("single")
    setSelectedGroupIds([])
  }, [form, user])

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
      title={isEdit ? "Edit User" : "Create Users"}
      description={
        isEdit
          ? `Update the user account details for ${user.name ?? user.external_id}.`
          : "Create one or more user accounts in Kamino."
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
              name="username"
              validators={{
                onBlur: ({ value }) => {
                  const result = usernameSchema.safeParse(value)
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
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <FieldContent>
                    <Input
                      id="username"
                      maxLength={20}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      placeholder="jdoe"
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
              name="password"
              validators={{
                onBlur: ({ value }) => validateOptionalPassword(value),
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
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      placeholder="Leave blank to keep unchanged"
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
          <div className="flex flex-col gap-6">
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as CreateMode)}
              className="gap-4"
            >
              <TabsList className="w-full border-b" variant="line">
                <TabsTrigger value="single">
                  <IconUser />
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
                    name="username"
                    validators={{
                      onBlur: ({ value }) => {
                        const result = usernameSchema.safeParse(value)
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
                        <FieldLabel htmlFor="single-username">
                          Username
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="single-username"
                            maxLength={20}
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            placeholder="jdoe"
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
                    name="password"
                    validators={{
                      onBlur: ({ value }) => validateRequiredPassword(value),
                    }}
                  >
                    {(field) => (
                      <Field
                        data-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <FieldLabel htmlFor="single-password">
                          Password
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="single-password"
                            type="password"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            placeholder="Password123!"
                            aria-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          />
                        </FieldContent>
                        <FieldError>{field.state.meta.errors[0]}</FieldError>
                      </Field>
                    )}
                  </form.Field>

                  <GroupAssignmentsField
                    id="single-group-assignments"
                    groupItems={groupItems}
                    groupOptionMap={groupOptionMap}
                    selectedGroupIds={selectedGroupIds}
                    setSelectedGroupIds={setSelectedGroupIds}
                  />

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
                        <FieldLabel htmlFor="list-input">User List</FieldLabel>
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
                              "jdoe,Password123!,Operations\nasmith,Password123!,Support"
                            }
                          />
                        </FieldContent>
                        <FieldDescription>
                          One user per line in{" "}
                          <span className="font-mono text-xs">
                            username,password,description
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
                            placeholder="user"
                            aria-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          />
                        </FieldContent>
                        <FieldDescription>
                          Generated usernames use the prefix plus a padded
                          number. i.e. user01, user02, user3.
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
                          <FieldLabel htmlFor="start">
                            Starting Number
                          </FieldLabel>
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
                              max={50}
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
                    name="sharedPassword"
                    validators={{
                      onBlur: ({ value }) => validateRequiredPassword(value),
                    }}
                  >
                    {(field) => (
                      <Field
                        data-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <FieldLabel htmlFor="shared-password">
                          Shared Password
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="shared-password"
                            type="password"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            placeholder="Password123!"
                            aria-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          />
                        </FieldContent>
                        <FieldError>{field.state.meta.errors[0]}</FieldError>
                      </Field>
                    )}
                  </form.Field>

                  <GroupAssignmentsField
                    id="prefix-group-assignments"
                    groupItems={groupItems}
                    groupOptionMap={groupOptionMap}
                    selectedGroupIds={selectedGroupIds}
                    setSelectedGroupIds={setSelectedGroupIds}
                  />

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

            {mode === "list" && (
              <FieldGroup>
                <GroupAssignmentsField
                  id="list-group-assignments"
                  groupItems={groupItems}
                  groupOptionMap={groupOptionMap}
                  selectedGroupIds={selectedGroupIds}
                  setSelectedGroupIds={setSelectedGroupIds}
                />
              </FieldGroup>
            )}
          </div>
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
          entityLabel="user"
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
