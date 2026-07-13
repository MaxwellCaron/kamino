import { useMemo } from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Router02Icon, RouterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DialogFooter } from "@workspace/ui/components/dialog"
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
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import type { IconSvgElement } from "@hugeicons/react"
import type { PodRouterCloneNetworkOption } from "@/features/pods/api/router-clone-api"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import { InventoryFolderCombobox } from "@/components/forms/inventory-folder-combobox"
import {
  cloneRouter,
  routerCloneOptionsQueryOptions,
} from "@/features/pods/api/router-clone-api"
import {
  inventoryTreeQueryOptions,
  seedInventoryItemCache,
} from "@/features/inventory/api/inventory-api"
import { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { InventoryPermissionKeys } from "@/features/inventory/utils/inventory-permissions"

type RouterCloneFormValues = {
  target_folder_id: string | null
  network_number: string
  network_profile_key: PodNetworkProfile["key"]
}

const routerProfileIcons: Record<
  RouterCloneFormValues["network_profile_key"],
  IconSvgElement
> = {
  "lan-router-v1": Router02Icon,
  "lan-dmz-router-v1": RouterIcon,
}

const routerCloneFormSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine(
      (value): value is string => !!value,
      "Destination folder is required"
    ),
  network_number: z
    .string()
    .trim()
    .min(1, "Pod VNet number is required")
    .refine(
      (value) => /^\d+$/.test(value),
      "Pod VNet number must be a whole number"
    )
    .transform((value) => Number.parseInt(value, 10))
    .refine(
      (value) => value >= 1 && value <= 254,
      "Pod VNet number must be between 1 and 254"
    ),
  network_profile_key: z.enum(["lan-router-v1", "lan-dmz-router-v1"]),
})

type NetworkNumberOption = {
  value: string
  label: string
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
  return (networkOptions ?? [])
    .filter((option) => option.network_profile_key === profileKey)
    .map((option) => ({
      value: String(option.network_number),
      label: formatNetworkOptionLabel(option),
    }))
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

function getRouterCloneToastName(
  folderOptions: ReturnType<typeof getInventoryFolderOptions>,
  folderId: string,
  networkNumber: number
) {
  const folder = folderOptions.find((option) => option.id === folderId)
  return folder
    ? `${folder.label} · pod ${networkNumber}`
    : `pod ${networkNumber}`
}

export function ManualRouterCloneDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const {
    data: routerOptions,
    error: routerOptionsError,
    isLoading: isRouterOptionsLoading,
  } = useQuery({
    ...routerCloneOptionsQueryOptions,
    enabled: open,
  })

  const {
    data: inventoryTreeData,
    error: inventoryTreeError,
    isLoading: isInventoryTreeLoading,
  } = useQuery({
    ...inventoryTreeQueryOptions,
    enabled: open,
  })

  const folderOptions = useMemo(
    () =>
      getInventoryFolderOptions(
        inventoryTreeData,
        InventoryPermissionKeys.createVm
      ),
    [inventoryTreeData]
  )

  const form = useForm({
    defaultValues: {
      target_folder_id: null as string | null,
      network_number: "",
      network_profile_key: "lan-router-v1" as PodNetworkProfile["key"],
    },
    onSubmit: ({ value }) => {
      const parsed = routerCloneFormSchema.parse(value)
      onOpenChange(false)

      showSingleMutationToast({
        title: "Cloning router",
        name: getRouterCloneToastName(
          folderOptions,
          parsed.target_folder_id,
          parsed.network_number
        ),
        promise: async () => {
          const result = await cloneRouter({
            target_folder_id: parsed.target_folder_id,
            network_number: parsed.network_number,
            network_profile_key: parsed.network_profile_key,
          })
          seedInventoryItemCache(queryClient, result.item_id, result.item)
          await queryClient.invalidateQueries({
            queryKey: inventoryTreeQueryOptions.queryKey,
          })
        },
        successDescription: "Cloned",
      })
    },
  })

  const isLoadingOptions = isRouterOptionsLoading || isInventoryTreeLoading
  const optionsError = routerOptionsError ?? inventoryTreeError
  const routerTemplateConfigured =
    routerOptions?.router_template_configured ?? false
  const networkProfiles = routerOptions?.network_profiles ?? []
  const hasDestinationFolders = folderOptions.length > 0
  const submitUnavailable =
    !routerTemplateConfigured || !hasDestinationFolders || isLoadingOptions

  function resetDialog() {
    form.reset()
  }

  return (
    <AppDialog
      className="sm:max-w-xl"
      open={open}
      onOpenChange={onOpenChange}
      onClosed={resetDialog}
      initialFocus={false}
      icon={RouterIcon}
      title="Clone router"
      description="Clone, configure, and start the pod router in a selected folder."
    >
      {optionsError ? (
        <InlineErrorAlert
          error={optionsError}
          fallback="Failed to load router clone options."
        />
      ) : isLoadingOptions ? (
        <DialogBodySkeleton rows={4} />
      ) : (
        <form
          action={() => {
            void form.handleSubmit()
          }}
        >
          <AppDialogScrollBody>
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

            <FieldSet>
              <FieldGroup>
                <form.Field name="network_profile_key">
                  {(field) => (
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

                <form.Subscribe
                  selector={(state) => state.values.network_profile_key}
                >
                  {(profileKey) => {
                    const numberOptions = getNetworkNumberOptions(
                      routerOptions?.network_options,
                      profileKey
                    )

                    return (
                      <form.Field
                        name="network_number"
                        validators={{
                          onBlur: ({ value }) => validateNetworkNumber(value),
                          onSubmit: ({ value }) => validateNetworkNumber(value),
                        }}
                      >
                        {(field) => {
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
                                    resolveNetworkNumberInput(
                                      value,
                                      numberOptions
                                    )
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
                                    field.state.meta.errors.length > 0 ||
                                    undefined
                                  }
                                />
                                <ComboboxEmpty>
                                  No matching configured VNets. You can still
                                  enter a number.
                                </ComboboxEmpty>
                                <ComboboxContent>
                                  <ComboboxList>
                                    {(option) => (
                                      <ComboboxItem
                                        key={option.value}
                                        value={option}
                                      >
                                        {option.label}
                                      </ComboboxItem>
                                    )}
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                              <FieldError>
                                {field.state.meta.errors[0]}
                              </FieldError>
                            </Field>
                          )
                        }}
                      </form.Field>
                    )
                  }}
                </form.Subscribe>

                <form.Field
                  name="target_folder_id"
                  validators={{
                    onBlur: ({ value }) => validateDestinationFolder(value),
                    onSubmit: ({ value }) => validateDestinationFolder(value),
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel>Destination Folder</FieldLabel>
                      <InventoryFolderCombobox
                        folderOptions={folderOptions}
                        selectedFolderId={field.state.value}
                        onSelectedFolderChange={(folderId) =>
                          field.handleChange(folderId)
                        }
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
              </FieldGroup>
            </FieldSet>
          </AppDialogScrollBody>

          <DialogFooter>
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <AppDialogPrimaryButton
                  disabled={submitUnavailable || !canSubmit}
                >
                  Clone router
                </AppDialogPrimaryButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      )}
    </AppDialog>
  )
}
