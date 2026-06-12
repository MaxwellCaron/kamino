import * as React from "react"
import { IconNotes, IconRegex, IconUser } from "@tabler/icons-react"
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
  CreateMode,
  UserFormApi,
} from "@/features/principals/components/users/user-dialog-utils"
import {
  parsePositiveInteger,
  usernameSchema,
  validateDescription,
  validateRequiredPassword,
} from "@/features/principals/components/users/user-dialog-utils"

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

type UserDialogCreateFormProps = {
  form: UserFormApi
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  mode: CreateMode
  selectedGroupIds: Array<string>
  setMode: React.Dispatch<React.SetStateAction<CreateMode>>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}

export function UserDialogCreateForm({
  form,
  groupItems,
  groupOptionMap,
  mode,
  selectedGroupIds,
  setMode,
  setSelectedGroupIds,
}: UserDialogCreateFormProps) {
  return (
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="single-username">Username</FieldLabel>
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="single-password">Password</FieldLabel>
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
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
                    Generated usernames use the prefix plus a padded number.
                    i.e. user01, user02, user3.
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
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
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
  )
}
