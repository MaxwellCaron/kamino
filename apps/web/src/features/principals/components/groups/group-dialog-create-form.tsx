import * as React from "react"
import { IconNotes, IconRegex, IconUsersGroup } from "@tabler/icons-react"
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
  CreateMode,
  GroupFormApi,
} from "@/features/principals/components/groups/group-dialog-utils"
import {
  groupNameSchema,
  parsePositiveInteger,
  validateDescription,
} from "@/features/principals/components/groups/group-dialog-utils"

type GroupDialogCreateFormProps = {
  form: GroupFormApi
  mode: CreateMode
  setMode: React.Dispatch<React.SetStateAction<CreateMode>>
}

export function GroupDialogCreateForm({
  form,
  mode,
  setMode,
}: GroupDialogCreateFormProps) {
  return (
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
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="single-name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    id="single-name"
                    maxLength={64}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
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
                <FieldLabel htmlFor="single-description">
                  Description
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    id="single-description"
                    maxLength={256}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
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
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={
                      "admins,Administrative group\noperators,Operations team"
                    }
                  />
                </FieldContent>
                <FieldDescription>
                  One group per line in{" "}
                  <span className="font-mono text-xs">name,description</span>{" "}
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
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="prefix">Prefix</FieldLabel>
                <FieldContent>
                  <Input
                    id="prefix"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="team"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                </FieldContent>
                <FieldDescription>
                  Generated group names use the prefix plus a padded number.
                  i.e. team01, team02, team03.
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
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
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="prefix-description">
                  Description
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    id="prefix-description"
                    maxLength={256}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
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
  )
}
