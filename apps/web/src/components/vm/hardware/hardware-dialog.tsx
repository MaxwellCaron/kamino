import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { IconPlus, IconSettings, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@workspace/ui/components/combobox"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { z } from "zod"
import type { ApiVmHardwareConfig } from "@/lib/queries"
import type { NetworkOption } from "@/components/vm/hardware/sections"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  getFirstIssueMessage,
  parseNumberInput,
  parseOptionalNumberInput,
} from "@/components/vm/create/create-vm-form"
import { renderError } from "@/components/vm/create/create-vm-step-shared"
import {
  biosTypes,
  cpuTypes,
  machineTypes,
  nicModels,
  osTypes,
  scsiControllers,
} from "@/components/vm/hardware/options"
import {
  VmHardwareComputeSection,
  VmHardwareNetworkCard,
  VmHardwareNetworkSection,
  VmHardwareOperatingSystemSection,
  VmHardwareStorageSection,
  buildVmHardwareNetworkOptions,
  getSelectOptionLabel,
} from "@/components/vm/hardware/sections"
import { useUpdateVMHardware } from "@/hooks/use-vm-actions"
import {
  bridgesQueryOptions,
  inventoryItemQueryOptions,
  storagesQueryOptions,
  vmHardwareQueryOptions,
} from "@/lib/queries"
import { formatVmReference } from "@/lib/utils"

const hardwareNetworkInterfaceSchema = z.object({
  device: z.string().optional(),
  mac_address: z.string().optional(),
  bridge: z.string().min(1, "Network bridge is required"),
  model: z.string().min(1, "NIC model is required"),
  vlan_tag: z.number().int().min(1).max(4094).optional(),
  firewall: z.boolean(),
})

const vmHardwareFormSchema = z.object({
  ostype: z.string().min(1, "OS type is required"),
  bios: z.string().min(1, "BIOS is required"),
  machine: z.string().min(1, "Machine type is required"),
  scsi: z.string().min(1, "SCSI controller is required"),
  sockets: z.number().int().min(1, "At least one socket is required"),
  cores: z.number().int().min(1, "At least one core is required"),
  cpu_type: z.string().min(1, "CPU type is required"),
  memory: z.number().int().min(1, "Memory must be at least 1 GB"),
  balloon: z.number().int().min(0, "Balloon must be 0 GB or higher"),
  storage: z.string().min(1, "Disk storage is required"),
  disk_size: z.number().int().min(1, "Disk size must be at least 1 GB"),
  networks: z
    .array(hardwareNetworkInterfaceSchema)
    .min(1, "At least one network interface is required")
    .max(5, "No more than 5 network interfaces are permitted."),
})

type VmHardwareFormValues = z.infer<typeof vmHardwareFormSchema>

type VmHardwareDialogProps = {
  itemId: string
  vmName: string
  vmid?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StorageOption = {
  storage: string
}

type VmHardwareDialogFormProps = {
  itemId: string
  vmName: string
  hardware: ApiVmHardwareConfig
  bridgeOptions: Array<NetworkOption>
  vnetOptions: Array<NetworkOption>
  networkOptions: Array<NetworkOption>
  storageOptions: Array<StorageOption>
  onOpenChange: (open: boolean) => void
}

function toFormValues(hardware: ApiVmHardwareConfig): VmHardwareFormValues {
  return {
    ostype: hardware.ostype,
    bios: hardware.bios,
    machine: hardware.machine,
    scsi: hardware.scsi,
    sockets: hardware.sockets,
    cores: hardware.cores,
    cpu_type: hardware.cpu_type,
    memory: hardware.memory,
    balloon: hardware.balloon,
    storage: hardware.storage,
    disk_size: hardware.disk_size,
    networks: hardware.networks.map((network) => ({
      device: network.device,
      mac_address: network.mac_address,
      bridge: network.bridge,
      model: network.model,
      vlan_tag: network.vlan_tag,
      firewall: network.firewall,
    })),
  }
}

function VmHardwareDialogForm({
  itemId,
  vmName,
  hardware,
  bridgeOptions,
  vnetOptions,
  networkOptions,
  storageOptions,
  onOpenChange,
}: VmHardwareDialogFormProps) {
  const updateHardware = useUpdateVMHardware(itemId)
  const minimumDiskSize = hardware.disk_size

  const form = useForm({
    defaultValues: toFormValues(hardware),
    onSubmit: ({ value }) => {
      const parsed = vmHardwareFormSchema.parse(value)
      if (parsed.disk_size < minimumDiskSize) {
        toast.error("Shrinking disks is not supported.")
        return
      }

      onOpenChange(false)

      toast.promise(
        updateHardware.mutateAsync({
          itemId,
          hardware: parsed,
        }),
        {
          loading: `Updating hardware for "${vmName}"...`,
          success: `Hardware updated for "${vmName}"`,
          error: (error: Error) => error.message,
        }
      )
    },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <AppDialogScrollBody className="h-[40vh]">
        <div className="flex flex-col gap-6">
          <VmHardwareOperatingSystemSection
            description="Review the guest OS type, firmware, and chipset settings."
            osTypeField={
              <form.Field name="ostype">
                {(field) => (
                  <Field>
                    <FieldLabel>OS Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value ?? "other")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {getSelectOptionLabel(osTypes, field.state.value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {osTypes.map((os) => (
                            <SelectItem key={os.value} value={os.value}>
                              {os.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            }
            biosField={
              <form.Field name="bios">
                {(field) => (
                  <Field>
                    <FieldLabel>BIOS</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value ?? "seabios")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {getSelectOptionLabel(biosTypes, field.state.value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {biosTypes.map((bios) => (
                            <SelectItem key={bios.value} value={bios.value}>
                              {bios.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            }
            machineField={
              <form.Field name="machine">
                {(field) => (
                  <Field>
                    <FieldLabel>Machine Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value ?? "pc")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {getSelectOptionLabel(
                            machineTypes,
                            field.state.value
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {machineTypes.map((machine) => (
                            <SelectItem
                              key={machine.value}
                              value={machine.value}
                            >
                              {machine.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            }
            scsiField={
              <form.Field name="scsi">
                {(field) => (
                  <Field>
                    <FieldLabel>SCSI Controller</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value ?? "virtio-scsi-single")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {getSelectOptionLabel(
                            scsiControllers,
                            field.state.value
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {scsiControllers.map((controller) => (
                            <SelectItem
                              key={controller.value}
                              value={controller.value}
                            >
                              {controller.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            }
          />

          <VmHardwareComputeSection
            description="Configure the CPU topology and memory profile."
            socketsField={
              <form.Field
                name="sockets"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(
                      vmHardwareFormSchema.shape.sockets.safeParse(value)
                    ),
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="hardware-sockets">Sockets</FieldLabel>
                    <Input
                      id="hardware-sockets"
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(event.target.value, 1)
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            }
            coresField={
              <form.Field
                name="cores"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(
                      vmHardwareFormSchema.shape.cores.safeParse(value)
                    ),
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="hardware-cores">Cores</FieldLabel>
                    <Input
                      id="hardware-cores"
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(event.target.value, 1)
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            }
            cpuTypeField={
              <form.Field name="cpu_type">
                {(field) => (
                  <Field>
                    <FieldLabel>CPU Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value ?? "x86-64-v2-AES")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {getSelectOptionLabel(cpuTypes, field.state.value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {cpuTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            }
            memoryField={
              <form.Field
                name="memory"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(
                      vmHardwareFormSchema.shape.memory.safeParse(value)
                    ),
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="hardware-memory">
                      Capacity (GB)
                    </FieldLabel>
                    <Input
                      id="hardware-memory"
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(event.target.value, 2)
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            }
            balloonField={
              <form.Field
                name="balloon"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(
                      vmHardwareFormSchema.shape.balloon.safeParse(value)
                    ),
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="hardware-balloon">
                      Balloon (GB)
                    </FieldLabel>
                    <Input
                      id="hardware-balloon"
                      type="number"
                      min={0}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(event.target.value, 0)
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            }
            balloonDescription='Set balloon to "0" to disable.'
          />

          <VmHardwareStorageSection
            storageField={
              <form.Field name="storage">
                {(field) => (
                  <Field>
                    <FieldLabel>Disk</FieldLabel>
                    <Select
                      value={field.state.value}
                      disabled
                      onValueChange={() => {}}
                    >
                      <SelectTrigger>
                        <SelectValue>{field.state.value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {storageOptions.map((storage) => (
                            <SelectItem
                              key={storage.storage}
                              value={storage.storage}
                            >
                              {storage.storage}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Disk moves are not supported in this dialog yet.
                    </FieldDescription>
                  </Field>
                )}
              </form.Field>
            }
            diskSizeField={
              <form.Field
                name="disk_size"
                validators={{
                  onBlur: ({ value }) => {
                    const issue = getFirstIssueMessage(
                      vmHardwareFormSchema.shape.disk_size.safeParse(value)
                    )
                    if (issue) return issue
                    if (value < minimumDiskSize) {
                      return `Disk size must be at least ${minimumDiskSize} GB.`
                    }
                    return undefined
                  },
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="hardware-disk-size">
                      Capacity (GB)
                    </FieldLabel>
                    <Input
                      id="hardware-disk-size"
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(
                            event.target.value,
                            field.state.value
                          )
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldDescription>
                      Existing disks can only be expanded from {minimumDiskSize}{" "}
                      GB.
                    </FieldDescription>
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            }
          />

          <VmHardwareNetworkSection>
            <form.Field name="networks" mode="array">
              {(networksField) => (
                <div className="flex flex-col gap-4">
                  {networksField.state.value.map((network, index) => (
                    <VmHardwareNetworkCard
                      key={network.device ?? `network-${index}`}
                      title={network.device || `net${index}`}
                      description={
                        network.mac_address
                          ? `MAC ${network.mac_address}`
                          : "Configure connectivity for this interface."
                      }
                      removeAction={
                        networksField.state.value.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Remove network interface"
                            onClick={() => networksField.removeValue(index)}
                          >
                            <IconTrash />
                          </Button>
                        ) : undefined
                      }
                    >
                      <FieldGroup>
                        <div className="grid grid-cols-2 gap-6">
                          <form.Field
                            name={`networks[${index}].bridge` as const}
                            validators={{
                              onBlur: ({ value }) =>
                                getFirstIssueMessage(
                                  hardwareNetworkInterfaceSchema.shape.bridge.safeParse(
                                    value
                                  )
                                ),
                            }}
                          >
                            {(field) => (
                              <Field
                                data-invalid={
                                  field.state.meta.errors.length > 0 ||
                                  undefined
                                }
                              >
                                <FieldLabel>Bridge / VNet</FieldLabel>
                                <Combobox
                                  items={networkOptions}
                                  itemToStringValue={(option) => option.label}
                                  value={
                                    networkOptions.find(
                                      (option) =>
                                        option.value === field.state.value
                                    ) ?? null
                                  }
                                  onValueChange={(option) =>
                                    field.handleChange(option?.value ?? "")
                                  }
                                  autoHighlight
                                >
                                  <ComboboxInput
                                    placeholder="Select network"
                                    onBlur={field.handleBlur}
                                    aria-invalid={
                                      field.state.meta.errors.length > 0 ||
                                      undefined
                                    }
                                  />
                                  <ComboboxContent>
                                    <ComboboxEmpty>
                                      No networks found.
                                    </ComboboxEmpty>
                                    <ComboboxList>
                                      {bridgeOptions.length ? (
                                        <ComboboxGroup items={bridgeOptions}>
                                          <ComboboxLabel>Bridges</ComboboxLabel>
                                          <ComboboxCollection>
                                            {(option) => (
                                              <ComboboxItem
                                                key={option.value}
                                                value={option}
                                              >
                                                {option.label}
                                              </ComboboxItem>
                                            )}
                                          </ComboboxCollection>
                                        </ComboboxGroup>
                                      ) : null}
                                      {bridgeOptions.length &&
                                      vnetOptions.length ? (
                                        <ComboboxSeparator />
                                      ) : null}
                                      {vnetOptions.length ? (
                                        <ComboboxGroup items={vnetOptions}>
                                          <ComboboxLabel>VNets</ComboboxLabel>
                                          <ComboboxCollection>
                                            {(option) => (
                                              <ComboboxItem
                                                key={option.value}
                                                value={option}
                                              >
                                                {option.label}
                                              </ComboboxItem>
                                            )}
                                          </ComboboxCollection>
                                        </ComboboxGroup>
                                      ) : null}
                                    </ComboboxList>
                                  </ComboboxContent>
                                </Combobox>
                                <FieldError>
                                  {renderError(field.state.meta.errors[0])}
                                </FieldError>
                              </Field>
                            )}
                          </form.Field>

                          <form.Field
                            name={`networks[${index}].model` as const}
                          >
                            {(field) => (
                              <Field>
                                <FieldLabel>Model</FieldLabel>
                                <Select
                                  value={field.state.value}
                                  onValueChange={(value) =>
                                    field.handleChange(value ?? "virtio")
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue>
                                      {getSelectOptionLabel(
                                        nicModels,
                                        field.state.value
                                      )}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {nicModels.map((model) => (
                                        <SelectItem
                                          key={model.value}
                                          value={model.value}
                                        >
                                          {model.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </Field>
                            )}
                          </form.Field>
                        </div>

                        <form.Field
                          name={`networks[${index}].vlan_tag` as const}
                        >
                          {(field) => (
                            <Field
                              data-invalid={
                                field.state.meta.errors.length > 0 || undefined
                              }
                            >
                              <FieldLabel
                                htmlFor={`hardware-network-vlan-${index}`}
                              >
                                VLAN Tag
                              </FieldLabel>
                              <Input
                                id={`hardware-network-vlan-${index}`}
                                type="number"
                                placeholder="Optional"
                                value={field.state.value ?? ""}
                                onBlur={field.handleBlur}
                                onChange={(event) =>
                                  field.handleChange(
                                    parseOptionalNumberInput(event.target.value)
                                  )
                                }
                                aria-invalid={
                                  field.state.meta.errors.length > 0 ||
                                  undefined
                                }
                              />
                              <FieldError>
                                {renderError(field.state.meta.errors[0])}
                              </FieldError>
                            </Field>
                          )}
                        </form.Field>

                        <form.Field
                          name={`networks[${index}].firewall` as const}
                        >
                          {(field) => (
                            <Field orientation="horizontal">
                              <Checkbox
                                id={`hardware-network-firewall-${index}`}
                                checked={field.state.value}
                                onCheckedChange={(checked) =>
                                  field.handleChange(Boolean(checked))
                                }
                              />
                              <FieldContent>
                                <FieldLabel
                                  htmlFor={`hardware-network-firewall-${index}`}
                                >
                                  Firewall
                                </FieldLabel>
                                <FieldDescription>
                                  Enable Proxmox firewall integration for this
                                  NIC.
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          )}
                        </form.Field>
                      </FieldGroup>
                    </VmHardwareNetworkCard>
                  ))}

                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        networksField.pushValue({
                          bridge: "vmbr0",
                          model: "virtio",
                          firewall: true,
                        })
                      }
                    >
                      <IconPlus data-icon="inline-start" />
                      Add Network Interface
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>
          </VmHardwareNetworkSection>
        </div>
      </AppDialogScrollBody>

      <DialogFooter>
        <AppDialogPrimaryButton disabled={updateHardware.isPending}>
          {updateHardware.isPending ? "Saving..." : "Save"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </form>
  )
}

export function VmHardwareDialog({
  itemId,
  vmName,
  vmid: initialVmid,
  open,
  onOpenChange,
}: VmHardwareDialogProps) {
  const itemQuery = useQuery({
    ...inventoryItemQueryOptions(itemId),
    enabled: open,
  })
  const node = itemQuery.data?.vm?.node ?? ""
  const vmid = itemQuery.data?.vm?.vmid ?? 0
  const isDialogOpen = open && node !== "" && vmid > 0
  const hardwareQuery = useQuery({
    ...vmHardwareQueryOptions(itemId),
    enabled: isDialogOpen,
  })
  const storagesQuery = useQuery({
    ...storagesQueryOptions(node),
    enabled: isDialogOpen,
  })
  const networksQuery = useQuery({
    ...bridgesQueryOptions(node),
    enabled: isDialogOpen,
  })

  const { bridgeOptions, vnetOptions, networkOptions } =
    buildVmHardwareNetworkOptions(networksQuery.data ?? {})
  const storageOptions = (storagesQuery.data ?? []) as Array<StorageOption>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        initialFocus={false}
        icon={IconSettings}
        title="Hardware"
        description={`Review and update the hardware profile for ${formatVmReference(
          initialVmid ?? vmid,
          vmName
        )}.`}
      >
        {hardwareQuery.isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {hardwareQuery.error instanceof Error
              ? hardwareQuery.error.message
              : "Failed to load VM hardware."}
          </div>
        ) : hardwareQuery.data ? (
          <VmHardwareDialogForm
            key={itemId}
            itemId={itemId}
            vmName={vmName}
            hardware={hardwareQuery.data}
            bridgeOptions={bridgeOptions}
            vnetOptions={vnetOptions}
            networkOptions={networkOptions}
            storageOptions={storageOptions}
            onOpenChange={onOpenChange}
          />
        ) : (
          <AppDialogScrollBody className="mb-0 h-[40vh] items-center justify-center px-1 py-4 text-sm text-muted-foreground">
            Loading current hardware...
          </AppDialogScrollBody>
        )}
      </AppDialogContent>
    </Dialog>
  )
}
