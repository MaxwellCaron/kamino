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
} from "@workspace/ui/components/field"
import { HugeiconsIcon } from "@hugeicons/react"
import { LockIcon } from "@hugeicons/core-free-icons"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { toPodAudiencePrincipal } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

type PublishPodAccessStepProps = {
  form: PublishPodFormApi
  principalOptionMap: Map<string, PrincipalOption>
  principalOptions: Array<PrincipalOption>
  submissionAttempts: number
}

export function PublishPodAccessStep({
  form,
  principalOptionMap,
  principalOptions,
  submissionAttempts,
}: PublishPodAccessStepProps) {
  const audienceAnchor = useComboboxAnchor()

  return (
    <PublishPodStepLayout form={form}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={LockIcon}
              className="size-5 text-muted-foreground"
            />
            Access
          </CardTitle>
          <CardDescription>
            Decide whether the pod is listed and whether access is public or
            restricted.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
          <FieldGroup>
            <form.Field name="status">
              {(field) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value === "unlisted"}
                    onCheckedChange={(checked) =>
                      field.handleChange(checked ? "unlisted" : "listed")
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Unlisted</FieldLabel>
                    <FieldDescription>
                      Hidden from users in the browse pods page and also
                      inventory tree, can be listed at any time.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            <form.Field name="audience" mode="array">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid
                const selectedPrincipals = field.state.value
                  .map((principal) => principalOptionMap.get(principal.id))
                  .filter(
                    (principal): principal is NonNullable<typeof principal> =>
                      !!principal
                  )

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel>Audience</FieldLabel>
                    <FieldContent>
                      <Combobox
                        multiple
                        autoHighlight
                        items={principalOptions}
                        itemToStringLabel={(principal) => principal.label}
                        value={selectedPrincipals}
                        onValueChange={(value) =>
                          field.handleChange(
                            value.map((principal) =>
                              toPodAudiencePrincipal(principal)
                            )
                          )
                        }
                      >
                        <ComboboxChips ref={audienceAnchor}>
                          <ComboboxValue>
                            {(values) => (
                              <>
                                {(values as Array<PrincipalOption>).map(
                                  (principal) => (
                                    <ComboboxChip key={principal.id}>
                                      {principal.label}
                                    </ComboboxChip>
                                  )
                                )}
                                <ComboboxChipsInput
                                  name={field.name}
                                  onBlur={field.handleBlur}
                                  aria-invalid={isInvalid || undefined}
                                  placeholder="Search for users or groups"
                                />
                              </>
                            )}
                          </ComboboxValue>
                        </ComboboxChips>
                        <ComboboxContent anchor={audienceAnchor}>
                          <ComboboxEmpty>No principals found.</ComboboxEmpty>
                          <ComboboxList>
                            {(principal) => (
                              <ComboboxItem
                                key={principal.id}
                                value={principal}
                              >
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
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                      <FieldDescription>
                        Leave empty for public access. Add users or groups to
                        limit who can browse and clone this pod.
                      </FieldDescription>
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
