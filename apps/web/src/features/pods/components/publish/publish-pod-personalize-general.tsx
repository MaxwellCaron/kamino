import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import { IconSettings } from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { PublishPodVmSection } from "./publish-pod-personalize-vms"
import { toPodAudiencePrincipal } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"

type PublishPodGeneralSectionProps = {
  creatorOptions: ReadonlyArray<string>
  folderOptions: ReadonlyArray<string>
  form: PublishPodFormApi
}

export function PublishPodGeneralSection({
  creatorOptions,
  folderOptions,
  form,
}: PublishPodGeneralSectionProps) {
  const creatorAnchor = useComboboxAnchor()
  const audienceAnchor = useComboboxAnchor()
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)

  const audienceOptions = useMemo(
    () => buildPrincipalOptions(usersQuery.data ?? [], groupsQuery.data ?? []),
    [groupsQuery.data, usersQuery.data]
  )

  const audienceOptionMap = useMemo(
    () => new Map(audienceOptions.map((option) => [option.id, option])),
    [audienceOptions]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings className="size-5 text-muted-foreground" />
          Personalize
        </CardTitle>
        <CardDescription>
          Configure the pod details, source folder, and default virtual machine
          permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t pt-6">
        <FieldGroup>
          <FieldSet>
            <FieldLegend>General</FieldLegend>
            <FieldDescription>
              Configure the basic details and appearance of your pod.
            </FieldDescription>
            <FieldGroup>
              <form.Field name="title">
                {(field) => {
                  const isInvalid = field.state.meta.errors.length > 0

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Pod Title</FieldLabel>
                      <FieldContent>
                        <InputGroup>
                          <InputGroupInput
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            maxLength={32}
                            aria-invalid={isInvalid || undefined}
                            placeholder="e.g. Modern Web Development"
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupText className="text-xs">
                              {field.state.value.length}/32
                            </InputGroupText>
                          </InputGroupAddon>
                        </InputGroup>
                        <FieldError errors={field.state.meta.errors} />
                      </FieldContent>
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="description">
                {(field) => {
                  const isInvalid = field.state.meta.errors.length > 0

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                      <FieldContent>
                        <InputGroup>
                          <InputGroupTextarea
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            maxLength={128}
                            aria-invalid={isInvalid || undefined}
                            placeholder="What will users learn in this pod?"
                          />
                          <InputGroupAddon align="block-end">
                            <InputGroupText className="ml-auto text-xs">
                              {field.state.value.length}/128
                            </InputGroupText>
                          </InputGroupAddon>
                        </InputGroup>
                        <FieldError errors={field.state.meta.errors} />
                      </FieldContent>
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="image">
                {(field) => {
                  const isInvalid = field.state.meta.errors.length > 0

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Image URL</FieldLabel>
                      <FieldContent>
                        <InputGroup>
                          <InputGroupInput
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            aria-invalid={isInvalid || undefined}
                            placeholder="https://images.unsplash.com/..."
                          />
                        </InputGroup>
                        <FieldError errors={field.state.meta.errors} />
                      </FieldContent>
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="creators" mode="array">
                {(field) => {
                  const isInvalid = field.state.meta.errors.length > 0

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel>Creators</FieldLabel>
                      <FieldContent>
                        <Combobox
                          multiple
                          autoHighlight
                          items={creatorOptions}
                          value={field.state.value}
                          onValueChange={(value) =>
                            field.handleChange(Array.from(new Set(value)))
                          }
                        >
                          <ComboboxChips ref={creatorAnchor}>
                            <ComboboxValue>
                              {(values) => (
                                <>
                                  {(values as Array<string>).map((value) => (
                                    <ComboboxChip key={value}>
                                      {value}
                                    </ComboboxChip>
                                  ))}
                                  <ComboboxChipsInput
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    aria-invalid={isInvalid || undefined}
                                    placeholder="Add creators"
                                  />
                                </>
                              )}
                            </ComboboxValue>
                          </ComboboxChips>
                          <ComboboxContent anchor={creatorAnchor}>
                            <ComboboxEmpty>No items found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item) => (
                                <ComboboxItem key={item} value={item}>
                                  {item}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        <FieldDescription>
                          Select one or more creators for this pod.
                        </FieldDescription>
                        <FieldError errors={field.state.meta.errors} />
                      </FieldContent>
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="status">
                {(field) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id={field.name}
                      checked={field.state.value === "listed"}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? "listed" : "unlisted")
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={field.name}>
                        Listed in Browse
                      </FieldLabel>
                      <FieldDescription>
                        Listed pods can appear in normal browse flows. Unlisted
                        pods are hidden from normal users and reserved for the
                        manager-facing catalog.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.status}>
                {(status) => (
                  <form.Field name="audience" mode="array">
                    {(field) => {
                      const isInvalid = field.state.meta.errors.length > 0
                      const selectedIds = field.state.value.map(
                        (principal) => principal.id
                      )
                      const isUnlisted = status === "unlisted"

                      return (
                        <Field
                          data-disabled={isUnlisted || undefined}
                          data-invalid={isInvalid || undefined}
                        >
                          <FieldLabel>Audience</FieldLabel>
                          <FieldContent>
                            <Combobox
                              multiple
                              autoHighlight
                              disabled={isUnlisted}
                              items={audienceOptions.map(
                                (principal) => principal.id
                              )}
                              value={selectedIds}
                              onValueChange={(value) =>
                                field.handleChange(
                                  value
                                    .map((id) => audienceOptionMap.get(id))
                                    .filter(
                                      (
                                        principal
                                      ): principal is NonNullable<
                                        typeof principal
                                      > => !!principal
                                    )
                                    .map((principal) =>
                                      toPodAudiencePrincipal(principal)
                                    )
                                )
                              }
                            >
                              <ComboboxChips
                                ref={audienceAnchor}
                                className="w-full data-disabled:opacity-60"
                              >
                                <ComboboxValue>
                                  {(values) => (
                                    <>
                                      {(values as Array<string>).map((id) => {
                                        const principal =
                                          field.state.value.find(
                                            (value) => value.id === id
                                          )

                                        return (
                                          <ComboboxChip
                                            key={id}
                                            showRemove={!isUnlisted}
                                          >
                                            {principal?.label ?? id}
                                          </ComboboxChip>
                                        )
                                      })}
                                      <ComboboxChipsInput
                                        name={field.name}
                                        onBlur={field.handleBlur}
                                        aria-invalid={isInvalid || undefined}
                                        disabled={isUnlisted}
                                        placeholder={
                                          isUnlisted
                                            ? "Unlisted pods ignore audience during this phase"
                                            : "Leave empty for public access, or add users and groups"
                                        }
                                      />
                                    </>
                                  )}
                                </ComboboxValue>
                              </ComboboxChips>
                              <ComboboxContent anchor={audienceAnchor}>
                                <ComboboxEmpty>
                                  No principals found.
                                </ComboboxEmpty>
                                <ComboboxList>
                                  {(id) => {
                                    const principal = audienceOptionMap.get(
                                      id as string
                                    )

                                    return principal ? (
                                      <ComboboxItem key={id} value={id}>
                                        <div className="flex min-w-0 flex-col">
                                          <span className="truncate">
                                            {principal.label}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {principal.type === "group"
                                              ? "Group"
                                              : "User"}
                                          </span>
                                        </div>
                                      </ComboboxItem>
                                    ) : null
                                  }}
                                </ComboboxList>
                              </ComboboxContent>
                            </Combobox>
                            <FieldDescription>
                              {isUnlisted
                                ? "Unlisted pods are hidden from normal users regardless of audience."
                                : "Leave this empty to make the pod public. Add users or groups to restrict browse and clone access."}
                            </FieldDescription>
                            <FieldError errors={field.state.meta.errors} />
                          </FieldContent>
                        </Field>
                      )
                    }}
                  </form.Field>
                )}
              </form.Subscribe>
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <PublishPodVmSection folderOptions={folderOptions} form={form} />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
