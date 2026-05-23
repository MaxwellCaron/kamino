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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { IconSettings } from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import type { PublishPodFormApi } from "./publish-pod-form"

type PublishPodGeneralSectionProps = {
  creatorOptions: ReadonlyArray<string>
  form: PublishPodFormApi
}

export function PublishPodGeneralSection({
  creatorOptions,
  form,
}: PublishPodGeneralSectionProps) {
  const anchor = useComboboxAnchor()

  return (
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
                      items={creatorOptions}
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(Array.from(new Set(value)))
                      }
                    >
                      <ComboboxChips ref={anchor}>
                        <ComboboxValue>
                          {(values) => (
                            <>
                              {(values as Array<string>).map((value) => (
                                <ComboboxChip key={value}>{value}</ComboboxChip>
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
  )
}
