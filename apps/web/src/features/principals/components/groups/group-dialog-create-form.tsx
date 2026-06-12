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
  descriptionFieldSchema,
  groupNameSchema,
  positiveIntegerStringSchema,
  prefixSchema,
} from "@/features/principals/components/groups/group-dialog-utils"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"

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
              onSubmit: groupNameSchema,
            }}
          >
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
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
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <form.Field
            name="description"
            validators={{
              onSubmit: descriptionFieldSchema,
            }}
          >
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <CountedTextareaField
                  id="single-description"
                  label="Description"
                  placeholder="Optional description"
                  isInvalid={isInvalid}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  maxLength={256}
                  className="max-h-100"
                  errors={isInvalid ? field.state.meta.errors : []}
                />
              )
            }}
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
              onSubmit: prefixSchema,
            }}
          >
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
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
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  <FieldDescription>
                    Generated group names use the prefix plus a padded number.
                    i.e. team01, team02, team03.
                  </FieldDescription>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <div className="grid grid-cols-2 gap-6">
            <form.Field
              name="start"
              validators={{
                onSubmit: positiveIntegerStringSchema("Starting number"),
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
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
                        aria-invalid={isInvalid}
                      />
                    </FieldContent>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field
              name="quantity"
              validators={{
                onSubmit: positiveIntegerStringSchema("Quantity"),
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
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
                        aria-invalid={isInvalid}
                      />
                    </FieldContent>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </div>

          <form.Field
            name="prefixDescription"
            validators={{
              onSubmit: descriptionFieldSchema,
            }}
          >
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <CountedTextareaField
                  id="prefix-description"
                  label="Description"
                  placeholder="Optional shared description"
                  isInvalid={isInvalid}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  maxLength={256}
                  className="max-h-100"
                  errors={isInvalid ? field.state.meta.errors : []}
                />
              )
            }}
          </form.Field>
        </FieldGroup>
      </TabsContent>
    </Tabs>
  )
}
