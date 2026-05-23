import * as React from "react"
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
  ComboboxInput,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  IconDeviceDesktop,
  IconFolderOpen,
  IconSettings,
} from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import type { PublishPodFormApi } from "./publish-pod-form"

const frameworks = [
  "Next.js",
  "SvelteKit",
  "Nuxt.js",
  "Remix",
  "Astro",
] as const

type PublishPodPersonalizeStepProps = {
  form: PublishPodFormApi
}

export function PublishPodPersonalizeStep({
  form,
}: PublishPodPersonalizeStepProps) {
  const anchor = useComboboxAnchor()

  return (
    <PublishPodStepLayout form={form}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconSettings className="size-5 text-muted-foreground" />
            General
          </CardTitle>
          <CardDescription>
            Configure the basic details and appearance of your pod.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
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
                        items={frameworks}
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(Array.from(new Set(value)))
                        }
                      >
                        <ComboboxChips ref={anchor}>
                          <ComboboxValue>
                            {(values) => (
                              <React.Fragment>
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
                              </React.Fragment>
                            )}
                          </ComboboxValue>
                        </ComboboxChips>
                        <ComboboxContent anchor={anchor}>
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
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDeviceDesktop className="size-5 text-muted-foreground" />
            Virtual Machines
          </CardTitle>
          <CardDescription>
            Select the folder that you want to create a new pod from and assign
            them individual permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
          <div className="flex flex-col gap-6">
            <form.Field name="source_folder">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel>Folder</FieldLabel>
                    <FieldContent>
                      <Combobox
                        items={frameworks}
                        value={field.state.value || null}
                        onValueChange={(value) =>
                          field.handleChange(value ?? "")
                        }
                      >
                        <ComboboxInput
                          name={field.name}
                          placeholder="Select base folder"
                          onBlur={field.handleBlur}
                          aria-invalid={isInvalid || undefined}
                        />
                        <ComboboxContent>
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
                      <FieldError errors={field.state.meta.errors} />
                      <FieldDescription>
                        This folder will be used as the source of truth for the
                        pod. Creating a pod will NOT touch or modify the
                        contents of this folder.
                      </FieldDescription>
                      <div className="flex flex-col gap-3 pt-3">
                        <p className="font-medium">Virtual Machines</p>
                        {field.state.value ? (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Item key={index} variant="muted">
                                <ItemMedia variant="icon">
                                  <IconDeviceDesktop />
                                </ItemMedia>
                                <ItemContent>
                                  <ItemTitle>
                                    Virtual Machine {index + 1}
                                  </ItemTitle>
                                  <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span>2 CPUs</span>
                                    <span>4GB RAM</span>
                                    <span>100GB Storage</span>
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Configure Virtual Machine ${index + 1}`}
                                  >
                                    <IconSettings data-icon="inline-end" />
                                  </Button>
                                </ItemActions>
                              </Item>
                            ))}
                          </div>
                        ) : (
                          <Empty className="min-h-56 rounded-xl border border-dashed">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <IconFolderOpen />
                              </EmptyMedia>
                              <EmptyTitle>No folder selected</EmptyTitle>
                              <EmptyDescription>
                                Select a folder above to preview the virtual
                                machines that will be included in this pod.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                        <span className="text-muted-foreground">
                          By default, users will be able to view VMs, manage
                          power status, and snapshots.
                        </span>
                      </div>
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>
          </div>
        </CardContent>
      </Card>
    </PublishPodStepLayout>
  )
}
