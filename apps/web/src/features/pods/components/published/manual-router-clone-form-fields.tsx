import { Router02Icon, RouterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
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
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import type { IconSvgElement } from "@hugeicons/react"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import type { PodRouterCloneNetworkOption } from "@/features/pods/api/router-clone-api"
import type { RouterCloneFormValues } from "./manual-router-clone-dialog"
import type { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { InventoryFolderCombobox } from "@/components/forms/inventory-folder-combobox"
import { VMIDField } from "@/components/vms/vmid-field"

type RouterCloneFormLike = {
  Field: any
  Subscribe: any
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

type NetworkNumberOption = {
  value: string
  label: string
}

const routerProfileIcons: Record<
  RouterCloneFormValues["network_profile_key"],
  IconSvgElement
> = {
  "lan-router-v1": Router02Icon,
  "lan-dmz-router-v1": RouterIcon,
}

function formatNetworkOptionLabel(option: PodRouterCloneNetworkOption) {
  if (option.vnets.length <= 1) {
    return `${option.network_number} — ${option.vnets[0] ?? ""}`
  }
  return `${option.network_number} — ${option.vnets.join(" + ")}`
}

function getNetworkNumberOptions(
  networkOptions: Array<PodRouterCloneNetworkOption> | undefined,
  profileKey: PodNetworkProfile["key"]
): Array<NetworkNumberOption> {
  const options: Array<NetworkNumberOption> = []

  for (const option of networkOptions ?? []) {
    if (option.network_profile_key !== profileKey) {
      continue
    }

    options.push({
      value: String(option.network_number),
      label: formatNetworkOptionLabel(option),
    })
  }

  return options
}

function findNetworkNumberOption(
  options: Array<NetworkNumberOption>,
  value: string
) {
  return options.find((option) => option.value === value)
}

function resolveNetworkNumberInput(
  value: string,
  options: Array<NetworkNumberOption>
) {
  const trimmed = value.trim()
  const matchedOption = options.find((option) => option.label === trimmed)
  return matchedOption?.value ?? trimmed
}

function validateDestinationFolder(value: string | null | undefined) {
  return value ? undefined : "Destination folder is required"
}

function validateNetworkNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return "Pod VNet number is required"
  }
  if (!/^\d+$/.test(trimmed)) {
    return "Pod VNet number must be a whole number"
  }
  const parsed = Number.parseInt(trimmed, 10)
  if (parsed < 1 || parsed > 254) {
    return "Pod VNet number must be between 1 and 254"
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

function RouterCloneNetworkNumberField({
  form,
  networkOptions,
}: {
  form: RouterCloneFormLike
  networkOptions: Array<PodRouterCloneNetworkOption> | undefined
}) {
  return (
    <form.Subscribe
      selector={(state: { values: RouterCloneFormValues }) =>
        state.values.network_profile_key
      }
    >
      {(profileKey: RouterCloneFormValues["network_profile_key"]) => {
        const numberOptions = getNetworkNumberOptions(networkOptions, profileKey)

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
            {(field: NetworkNumberFieldApi) => {
              const selectedNumberOption = findNetworkNumberOption(
                numberOptions,
                field.state.value.trim()
              )

              return (
                <Field
                  data-invalid={
                    field.state.meta.errors.length > 0 || undefined
                  }
                >
                  <FieldLabel htmlFor="router-network-number">
                    Pod VNet
                  </FieldLabel>
                  <Combobox
                    items={numberOptions}
                    itemToStringValue={(option) => option.label}
                    isItemEqualToValue={(left, right) =>
                      left.value === right.value
                    }
                    value={selectedNumberOption ?? null}
                    onValueChange={(option) => {
                      field.handleChange(option?.value ?? "")
                    }}
                    onInputValueChange={(value) => {
                      field.handleChange(
                        resolveNetworkNumberInput(value, numberOptions)
                      )
                    }}
                    autoHighlight
                  >
                    <ComboboxInput
                      id="router-network-number"
                      inputMode="numeric"
                      placeholder="Select or enter a number"
                      onBlur={field.handleBlur}
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <ComboboxEmpty>
                      No matching configured VNets. You can still enter a
                      number.
                    </ComboboxEmpty>
                    <ComboboxContent>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )
            }}
          </form.Field>
        )
      }}
    </form.Subscribe>
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
  networkOptions,
  folderOptions,
}: {
  form: RouterCloneFormLike
  routerTemplateConfigured: boolean
  hasDestinationFolders: boolean
  networkProfiles: Array<PodNetworkProfile>
  networkOptions: Array<PodRouterCloneNetworkOption> | undefined
  folderOptions: ReturnType<typeof getInventoryFolderOptions>
}) {
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
          <RouterCloneNetworkNumberField
            form={form}
            networkOptions={networkOptions}
          />
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
