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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { IconSettings } from "@tabler/icons-react"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { toPodCreator } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

type PublishPodPersonalizeStepProps = {
  form: PublishPodFormApi
  principalOptionMap: Map<string, PrincipalOption>
  principalOptions: Array<PrincipalOption>
  submissionAttempts: number
}

export function PublishPodPersonalizeStep({
  form,
  principalOptionMap,
  principalOptions,
  submissionAttempts,
}: PublishPodPersonalizeStepProps) {
  const creatorAnchor = useComboboxAnchor()

  return (
    <PublishPodStepLayout form={form}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconSettings className="size-5 text-muted-foreground" />
            Personalize
          </CardTitle>
          <CardDescription>
            Configure the pod title, summary, creators, and cover image.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
          <FieldGroup>
            <form.Field name="title">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid

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
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid

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
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="creators" mode="array">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid
                const selectedIds = field.state.value.map(
                  (creator) => creator.id
                )

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel>Creators</FieldLabel>
                    <FieldContent>
                      <Combobox
                        multiple
                        autoHighlight
                        items={principalOptions.map(
                          (principal) => principal.id
                        )}
                        value={selectedIds}
                        onValueChange={(value) =>
                          field.handleChange(
                            value
                              .map((id) => principalOptionMap.get(id))
                              .filter(
                                (
                                  principal
                                ): principal is NonNullable<typeof principal> =>
                                  !!principal
                              )
                              .map((principal) => toPodCreator(principal))
                          )
                        }
                      >
                        <ComboboxChips ref={creatorAnchor}>
                          <ComboboxValue>
                            {(values) => (
                              <>
                                {(values as Array<string>).map((id) => (
                                  <ComboboxChip key={id}>
                                    {field.state.value.find(
                                      (creator) => creator.id === id
                                    )?.label ?? id}
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
                            {(id) => {
                              const principal = principalOptionMap.get(
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
                        Choose the principals credited as authors of this pod.
                      </FieldDescription>
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="image">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid

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
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </PublishPodStepLayout>
  )
}
