import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  getFirstIssueMessage,
  optionalVmNameSchema,
  optionalVmidSchema,
  parseNumberInput,
} from "./create-vm-form"
import { renderError } from "./create-vm-step-shared"
import type { ComponentType } from "react"
import type { InventoryFolderOption } from "@/lib/inventory-tree"
import type { ApiNode } from "@/lib/queries"
import { getSelectedFolder } from "@/lib/inventory-tree"
import { validateVMID } from "@/lib/queries"

type AppFieldComponent = ComponentType<any>

export function CloneNameField({
  FieldComponent,
  fieldName,
  inputId,
  placeholder,
}: {
  FieldComponent: AppFieldComponent
  fieldName: string
  inputId: string
  placeholder: string
}) {
  return (
    <FieldComponent
      name={fieldName}
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(optionalVmNameSchema.safeParse(value)),
      }}
    >
      {(field: any) => (
        <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
          <FieldLabel htmlFor={inputId}>Name</FieldLabel>
          <Input
            id={inputId}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={placeholder}
            aria-invalid={field.state.meta.errors.length > 0 || undefined}
          />
          <FieldError>{renderError(field.state.meta.errors[0])}</FieldError>
        </Field>
      )}
    </FieldComponent>
  )
}

export function CloneNodeField({
  FieldComponent,
  fieldName,
  inputId,
  nodes,
}: {
  FieldComponent: AppFieldComponent
  fieldName: string
  inputId: string
  nodes: Array<ApiNode>
}) {
  return (
    <FieldComponent name={fieldName}>
      {(field: any) => (
        <Field>
          <FieldLabel htmlFor={inputId}>Node</FieldLabel>
          <Select
            value={field.state.value}
            onValueChange={(value) => field.handleChange(value ?? "")}
          >
            <SelectTrigger id={inputId}>
              <SelectValue placeholder="Optimal (Default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Nodes</SelectLabel>
                <SelectItem value="">Optimal (Default)</SelectItem>
                {nodes.map((node) => (
                  <SelectItem key={node.node} value={node.node}>
                    {node.node}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    </FieldComponent>
  )
}

export function CloneVmidField({
  FieldComponent,
  fieldName,
  inputId,
}: {
  FieldComponent: AppFieldComponent
  fieldName: string
  inputId: string
}) {
  return (
    <FieldComponent
      name={fieldName}
      validators={{
        onBlur: ({ value }: { value: number }) =>
          getFirstIssueMessage(optionalVmidSchema.safeParse(value)),
        onBlurAsync: async ({ value }: { value: number }) => {
          if (value === 0) return undefined
          try {
            const valid = await validateVMID(value)
            return valid ? undefined : "VM ID is already in use"
          } catch (error) {
            return error instanceof Error
              ? error.message
              : "Failed to validate VM ID"
          }
        },
      }}
    >
      {(field: any) => (
        <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
          <FieldLabel htmlFor={inputId}>VMID</FieldLabel>
          <Input
            id={inputId}
            type="number"
            value={field.state.value || ""}
            placeholder="Next (Default)"
            onBlur={field.handleBlur}
            onChange={(event) =>
              field.handleChange(parseNumberInput(event.target.value, 0))
            }
            aria-invalid={field.state.meta.errors.length > 0 || undefined}
          />
          <FieldError>{renderError(field.state.meta.errors[0])}</FieldError>
        </Field>
      )}
    </FieldComponent>
  )
}

export function CloneDestinationFolderField({
  FieldComponent,
  fieldName,
  folderOptions,
}: {
  FieldComponent: AppFieldComponent
  fieldName: string
  folderOptions: Array<InventoryFolderOption>
}) {
  return (
    <FieldComponent name={fieldName}>
      {(field: any) => (
        <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
          <FieldLabel>Destination Folder</FieldLabel>
          <Combobox
            items={folderOptions}
            itemToStringValue={(folder) => folder.label}
            value={getSelectedFolder(folderOptions, field.state.value) ?? null}
            onValueChange={(folder) => field.handleChange(folder?.id ?? "")}
            autoHighlight
          >
            <ComboboxInput
              placeholder="Critical / Pods"
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
            />
            <ComboboxEmpty>No folders found.</ComboboxEmpty>
            <ComboboxContent>
              <ComboboxList>
                {(folder) => (
                  <ComboboxItem key={folder.id} value={folder}>
                    {folder.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            Where the vm will be placed once cloned.
          </FieldDescription>
          <FieldError>{renderError(field.state.meta.errors[0])}</FieldError>
        </Field>
      )}
    </FieldComponent>
  )
}

export function CloneFullCloneField({
  FieldComponent,
  fieldName,
  inputId,
  dependencyLabel,
}: {
  FieldComponent: AppFieldComponent
  fieldName: string
  inputId: string
  dependencyLabel: string
}) {
  return (
    <FieldComponent name={fieldName}>
      {(field: any) => (
        <Field orientation="horizontal">
          <Checkbox
            id={inputId}
            checked={field.state.value}
            onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
          />
          <FieldContent>
            <FieldLabel htmlFor={inputId}>Full clone</FieldLabel>
            <FieldDescription>{`Linked clones are faster, but they depend on the ${dependencyLabel}.`}</FieldDescription>
          </FieldContent>
        </Field>
      )}
    </FieldComponent>
  )
}
