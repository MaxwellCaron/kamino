import { Router02Icon, RouterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { IconSvgElement } from "@hugeicons/react"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type { RouterCloneFormValues } from "./manual-router-clone-dialog"
import type { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { InventoryFolderCombobox } from "@/components/forms/inventory-folder-combobox"
import { VMIDField } from "@/components/vms/vmid-field"

type RouterCloneFormLike = {
  Field: any
}

type ProfileKeyFieldApi = {
  state: {
    value: RouterCloneFormValues["network_profile_key"]
    meta: { errors: Array<string | undefined> }
  }
  handleChange: (value: RouterCloneFormValues["network_profile_key"]) => void
  handleBlur: () => void
}

type NetworkNumberFieldApi = {
  state: {
    value: string
    meta: { errors: Array<string | undefined> }
  }
  handleChange: (value: string) => void
  handleBlur: () => void
}

type DestinationFolderFieldApi = {
  state: {
    value: string | null
    meta: { errors: Array<string | undefined> }
  }
  handleChange: (value: string | null) => void
  handleBlur: () => void
}

const routerProfileIcons: Record<
  RouterCloneFormValues["network_profile_key"],
  IconSvgElement
> = {
  "lan-router-v1": Router02Icon,
  "lan-dmz-router-v1": RouterIcon,
}

function validateDestinationFolder(value: string | null | undefined) {
  return value ? undefined : "Destination folder is required"
}

function validateNetworkNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return "Inner VLAN tag is required"
  }
  if (!/^\d+$/.test(trimmed)) {
    return "Inner VLAN tag must be a whole number"
  }
  const parsed = Number.parseInt(trimmed, 10)
  if (parsed < 1 || parsed > 255) {
    return "Inner VLAN tag must be between 1 and 255"
  }
  return undefined
}

function RouterCloneUnavailableState({
  routerTemplateConfigured,
  hasDestinationFolders,
}: {
  routerTemplateConfigured: boolean
  hasDestinationFolders: boolean
}) {
  return (
    <>
      {!routerTemplateConfigured ? (
        <p className="text-sm text-muted-foreground">
          The pod router template is not configured.
        </p>
      ) : null}

      {!hasDestinationFolders ? (
        <p className="text-sm text-muted-foreground">
          No destination folders are available.
        </p>
      ) : null}
    </>
  )
}

function RouterCloneProfileField({
  form,
  networkProfiles,
}: {
  form: RouterCloneFormLike
  networkProfiles: Array<PodNetworkProfile>
}) {
  return (
    <form.Field name="network_profile_key">
      {(field: ProfileKeyFieldApi) => (
        <Field>
          <FieldTitle>Router type</FieldTitle>
          <RadioGroup
            className="grid w-full grid-cols-1 gap-3"
            value={field.state.value}
            onValueChange={(value) =>
              field.handleChange(
                value as RouterCloneFormValues["network_profile_key"]
              )
            }
          >
            {networkProfiles.map((profile) => (
              <FieldLabel
                key={profile.key}
                htmlFor={`router-profile-${profile.key}`}
                className="cursor-pointer"
              >
                <Field
                  orientation="vertical"
                  className="h-full min-h-0 gap-3"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <HugeiconsIcon
                      icon={routerProfileIcons[profile.key]}
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <RadioGroupItem
                      id={`router-profile-${profile.key}`}
                      value={profile.key}
                      onBlur={field.handleBlur}
                      className="mt-0.5"
                    />
                  </div>
                  <FieldContent className="gap-1.5">
                    <FieldTitle className="text-sm leading-snug">
                      {profile.label}
                    </FieldTitle>
                    <FieldDescription className="text-pretty">
                      {profile.description}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </Field>
      )}
    </form.Field>
  )
}

function RouterCloneTargetField({
  form,
  cloneTargets,
  defaultCloneTargetKey,
}: {
  form: RouterCloneFormLike
  cloneTargets: Array<PodCloneTarget>
  defaultCloneTargetKey: string
}) {
  const cloneTargetItems = cloneTargets.map((target) => ({
    label: target.label,
    value: target.key,
  }))

  return (
    <form.Field name="clone_target_key">
      {(field: NetworkNumberFieldApi) => (
        <Field>
          <FieldLabel htmlFor="router-clone-target">Clone Target</FieldLabel>
          <Select
            items={cloneTargetItems}
            value={field.state.value || defaultCloneTargetKey}
            onValueChange={(value) => field.handleChange(String(value))}
          >
            <SelectTrigger id="router-clone-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {cloneTargetItems.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Subnet and bridge the router is placed on.
          </FieldDescription>
        </Field>
      )}
    </form.Field>
  )
}

function RouterCloneNetworkNumberField({ form }: { form: RouterCloneFormLike }) {
  return (
    <form.Field
      name="network_number"
      validators={{
        onBlur: ({ value }: { value: string }) =>
          validateNetworkNumber(value),
        onSubmit: ({ value }: { value: string }) =>
          validateNetworkNumber(value),
      }}
    >
      {(field: NetworkNumberFieldApi) => (
        <Field
          data-invalid={field.state.meta.errors.length > 0 || undefined}
        >
          <FieldLabel htmlFor="router-network-number">
            Inner VLAN tag
          </FieldLabel>
          <Input
            id="router-network-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={255}
            step={1}
            required
            placeholder="1–255"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            aria-invalid={field.state.meta.errors.length > 0 || undefined}
          />
          <FieldError>{field.state.meta.errors[0]}</FieldError>
        </Field>
      )}
    </form.Field>
  )
}

function RouterCloneDestinationFolderField({
  form,
  folderOptions,
  hasDestinationFolders,
}: {
  form: RouterCloneFormLike
  folderOptions: ReturnType<typeof getInventoryFolderOptions>
  hasDestinationFolders: boolean
}) {
  return (
    <form.Field
      name="target_folder_id"
      validators={{
        onBlur: ({ value }: { value: string | null }) =>
          validateDestinationFolder(value),
        onSubmit: ({ value }: { value: string | null }) =>
          validateDestinationFolder(value),
      }}
    >
      {(field: DestinationFolderFieldApi) => (
        <Field
          data-invalid={field.state.meta.errors.length > 0 || undefined}
        >
          <FieldLabel>Destination Folder</FieldLabel>
          <InventoryFolderCombobox
            folderOptions={folderOptions}
            selectedFolderId={field.state.value}
            onSelectedFolderChange={(folderId) => field.handleChange(folderId)}
            onBlur={field.handleBlur}
            invalid={field.state.meta.errors.length > 0}
            disabled={!hasDestinationFolders}
          />
          <FieldDescription>
            The inventory folder that will receive the router.
          </FieldDescription>
          <FieldError>{field.state.meta.errors[0]}</FieldError>
        </Field>
      )}
    </form.Field>
  )
}

export function ManualRouterCloneFormFields({
  form,
  routerTemplateConfigured,
  hasDestinationFolders,
  networkProfiles,
  folderOptions,
  cloneTargets,
}: {
  form: RouterCloneFormLike
  routerTemplateConfigured: boolean
  hasDestinationFolders: boolean
  networkProfiles: Array<PodNetworkProfile>
  folderOptions: ReturnType<typeof getInventoryFolderOptions>
  cloneTargets: Array<PodCloneTarget>
}) {
  const defaultCloneTarget =
    cloneTargets.find((target) => target.is_default) ?? cloneTargets.at(0)
  const defaultCloneTargetKey = defaultCloneTarget?.key ?? ""

  return (
    <>
      <RouterCloneUnavailableState
        routerTemplateConfigured={routerTemplateConfigured}
        hasDestinationFolders={hasDestinationFolders}
      />

      <FieldSet>
        <FieldGroup>
          <RouterCloneProfileField
            form={form}
            networkProfiles={networkProfiles}
          />
          <RouterCloneTargetField
            form={form}
            cloneTargets={cloneTargets}
            defaultCloneTargetKey={defaultCloneTargetKey}
          />
          <RouterCloneNetworkNumberField form={form} />
          <VMIDField
            FieldComponent={form.Field}
            fieldName="vmid"
            inputId="router-clone-vmid"
          />
          <RouterCloneDestinationFolderField
            form={form}
            folderOptions={folderOptions}
            hasDestinationFolders={hasDestinationFolders}
          />
        </FieldGroup>
      </FieldSet>
    </>
  )
}
