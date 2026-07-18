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
  getFirstIssueMessage,
  optionalVmNameSchema,
} from "./create-vm-form"
import { formatFieldError } from "./create-vm-step-utils"
import type { ComponentType } from "react"
import type { InventoryFolderOption } from "@/features/inventory/utils/inventory-tree"
import type { ApiNode } from "@/features/vms/types/vm-types"
import { InventoryFolderCombobox } from "@/components/forms/inventory-folder-combobox"
import { replaceWhitespaceWithHyphen } from "@/features/shared/utils/sanitize"

type AppFieldComponent = ComponentType<any>

function validateDestinationFolder(value: string | null | undefined) {
  return value ? undefined : "Destination folder is required"
}

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
            onChange={(event) =>
              field.handleChange(
                replaceWhitespaceWithHyphen(event.target.value)
              )
            }
            placeholder={placeholder}
            aria-invalid={field.state.meta.errors.length > 0 || undefined}
          />
          <FieldError>
            {formatFieldError(field.state.meta.errors[0])}
          </FieldError>
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
    <FieldComponent
      name={fieldName}
      validators={{
        onBlur: ({ value }: { value: string | null | undefined }) =>
          validateDestinationFolder(value),
        onSubmit: ({ value }: { value: string | null | undefined }) =>
          validateDestinationFolder(value),
      }}
    >
      {(field: any) => (
        <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
          <FieldLabel>Destination Folder</FieldLabel>
          <InventoryFolderCombobox
            folderOptions={folderOptions}
            selectedFolderId={field.state.value}
            onSelectedFolderChange={(folderId) => field.handleChange(folderId)}
            onBlur={field.handleBlur}
            invalid={field.state.meta.errors.length > 0}
          />
          <FieldError>
            {formatFieldError(field.state.meta.errors[0])}
          </FieldError>
          <FieldDescription>
            Where the vm will be placed once cloned.
          </FieldDescription>
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
