import {
  FloppyDiskIcon,
  Layout01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { createVmFormOptions, withCreateVmForm } from "./create-vm-form"
import type { IconSvgElement } from "@hugeicons/react"
import type { CreateVmMethod } from "./create-vm-form"

const createMethodCards: Array<{
  value: CreateVmMethod
  title: string
  description: string
  icon: IconSvgElement
}> = [
  {
    value: "template",
    title: "Template",
    description:
      "Clone from an existing VM template already registered in Kamino.",
    icon: Layout01Icon,
  },
  {
    value: "iso",
    title: "ISO",
    description:
      "Build a new virtual machine from an ISO already stored in Proxmox.",
    icon: FloppyDiskIcon,
  },
  {
    value: "upload",
    title: "Upload",
    description:
      "Future flow for uploading media and creating a VM from your own ISO.",
    icon: Upload01Icon,
  },
]

export const CreateVmMethodStep = withCreateVmForm({
  ...createVmFormOptions,
  render: function Render({ form }) {
    return (
      <form.AppField name="method">
        {(field) => (
          <FieldSet>
            <FieldLegend>Creation Method</FieldLegend>
            <FieldDescription>
              Choose how this virtual machine should be provisioned.
            </FieldDescription>
            <RadioGroup
              value={field.state.value}
              onValueChange={(value) => {
                const nextValue = value as CreateVmMethod
                field.handleChange(nextValue)
              }}
              className="max-w-2xl"
            >
              {createMethodCards.map((method) => {
                const Icon = method.icon

                return (
                  <FieldLabel
                    key={method.value}
                    htmlFor={`create-${method.value}`}
                  >
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <HugeiconsIcon icon={Icon} className="size-4" />
                          {method.title}
                          {method.value === "upload" && (
                            <Badge variant="destructive">Disabled</Badge>
                          )}
                        </FieldTitle>
                        <FieldDescription>
                          {method.description}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        id={`create-${method.value}`}
                        value={method.value}
                        disabled={method.value === "upload"}
                      />
                    </Field>
                  </FieldLabel>
                )
              })}
            </RadioGroup>
          </FieldSet>
        )}
      </form.AppField>
    )
  },
})
