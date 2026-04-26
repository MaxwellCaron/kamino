import {
  IconBolt,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
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
import {
  createVmFormOptions,
  getFirstIssueMessage,
  networkInterfaceSchema,
  optionalVmidSchema,
  parseNumberInput,
  parseOptionalNumberInput,
  withCreateVmForm,
} from "./create-vm-form"
import { renderError } from "./create-vm-step-shared"
import type { NetworkData } from "./create-vm-step-shared"
import type { ApiISO, ApiNode, ApiStorage } from "@/lib/queries"
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
} from "@/components/vm/hardware/sections"
import { validateVMID } from "@/lib/queries"
import { vmNameSchema } from "@/lib/vm-name"

export const IsoConfigurationFields = withCreateVmForm({
  ...createVmFormOptions,
  props: {
    nodes: [] as Array<ApiNode>,
    diskStorages: [] as Array<ApiStorage>,
    isoStorages: [] as Array<ApiStorage>,
    isos: [] as Array<ApiISO>,
    networks: undefined as NetworkData | undefined,
  },
  render: function Render({
    form,
    nodes,
    diskStorages,
    isoStorages,
    isos,
    networks,
  }) {
    const { bridgeOptions, vnetOptions, networkOptions } =
      buildVmHardwareNetworkOptions(networks ?? {})

    return (
      <div className="flex flex-col gap-6">
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            <IconSettings className="size-4" />
            General
          </FieldLegend>
          <FieldDescription>
            Set where the VM should run and how it will be identified.
          </FieldDescription>
          <FieldGroup>
            <form.AppField
              name="name"
              validators={{
                onBlur: ({ value }) =>
                  getFirstIssueMessage(vmNameSchema.safeParse(value)),
              }}
            >
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-name">Name</FieldLabel>
                  <Input
                    id="iso-name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="ubuntu-01"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>
                    {renderError(field.state.meta.errors[0])}
                  </FieldError>
                </Field>
              )}
            </form.AppField>

            <div className="grid grid-cols-2 gap-6">
              <form.AppField name="node">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="node">Node</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value ?? "")}
                    >
                      <SelectTrigger
                        aria-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
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
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>

              <form.AppField
                name="vmid"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(optionalVmidSchema.safeParse(value)),
                  onBlurAsync: async ({ value }) => {
                    if (value === 0) return undefined
                    try {
                      const valid = await validateVMID(value)
                      return valid ? undefined : "VMID is already in use"
                    } catch (error) {
                      return error instanceof Error
                        ? error.message
                        : "Failed to validate VMID"
                    }
                  },
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="iso-vmid">VMID</FieldLabel>
                    <Input
                      id="iso-vmid"
                      type="number"
                      value={field.state.value || ""}
                      placeholder="Next (Default)"
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
              </form.AppField>
            </div>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <VmHardwareOperatingSystemSection
          legendIcon={<IconBolt className="size-4" />}
          description="Select the guest OS type and the ISO that should boot the VM."
          leadingFields={
            <>
              <form.AppField name="iso_storage">
                {(field) => (
                  <Field>
                    <FieldLabel>ISO Storage</FieldLabel>
                    <Select
                      value={field.state.value ?? ""}
                      onValueChange={(value) => {
                        const next = value ?? ""
                        field.handleChange(next)
                        form.setFieldValue("iso", "")
                      }}
                    >
                      <SelectTrigger
                        aria-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <SelectValue placeholder="Select storage for ISOs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>ISO Stores</SelectLabel>
                          {isoStorages.map((storage) => (
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
                      Choose the storage that contains the installation ISO.
                    </FieldDescription>
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>

              <form.AppField name="iso">
                {(field) => (
                  <Field>
                    <FieldLabel>ISO Image</FieldLabel>
                    <Select
                      value={field.state.value ?? ""}
                      disabled={!form.state.values.iso_storage}
                      onValueChange={(value) => field.handleChange(value ?? "")}
                    >
                      <SelectTrigger
                        aria-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <SelectValue placeholder="Select an ISO image" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Images</SelectLabel>
                          {isos.map((iso) => (
                            <SelectItem key={iso.volid} value={iso.volid}>
                              {iso.volid}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {form.state.values.iso_storage
                        ? "Choose the ISO image to attach as the install media."
                        : "Select an ISO storage first to load images."}
                    </FieldDescription>
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>
            </>
          }
          osTypeField={
            <form.AppField name="ostype">
              {(field) => (
                <Field>
                  <FieldLabel>OS Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value ?? "other")
                    }
                    items={osTypes}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
            </form.AppField>
          }
          biosField={
            <form.AppField name="bios">
              {(field) => (
                <Field>
                  <FieldLabel>BIOS</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value ?? "seabios")
                    }
                    items={biosTypes}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
            </form.AppField>
          }
          machineField={
            <form.AppField name="machine">
              {(field) => (
                <Field>
                  <FieldLabel>Machine Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "pc")}
                    items={machineTypes}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {machineTypes.map((machine) => (
                          <SelectItem key={machine.value} value={machine.value}>
                            {machine.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.AppField>
          }
          scsiField={
            <form.AppField name="scsi">
              {(field) => (
                <Field>
                  <FieldLabel>SCSI Controller</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value ?? "virtio-scsi-single")
                    }
                    items={scsiControllers}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
            </form.AppField>
          }
        />

        <VmHardwareComputeSection
          description="Configure the virtual CPU, firmware, and memory profile."
          socketsField={
            <form.AppField name="sockets">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-sockets">Sockets</FieldLabel>
                  <Input
                    id="iso-sockets"
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
            </form.AppField>
          }
          coresField={
            <form.AppField name="cores">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-cores">Cores</FieldLabel>
                  <Input
                    id="iso-cores"
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
            </form.AppField>
          }
          cpuTypeField={
            <form.AppField name="cpu_type">
              {(field) => (
                <Field>
                  <FieldLabel>CPU Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value ?? "x86-64-v2-AES")
                    }
                    items={cpuTypes}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
            </form.AppField>
          }
          memoryField={
            <form.AppField name="memory">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-memory">Capacity (GB)</FieldLabel>
                  <Input
                    id="iso-memory"
                    type="number"
                    min={1}
                    step={1}
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
            </form.AppField>
          }
          balloonField={
            <form.AppField name="balloon">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-balloon">Balloon (GB)</FieldLabel>
                  <Input
                    id="iso-balloon"
                    type="number"
                    min={0}
                    step={1}
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
            </form.AppField>
          }
          balloonDescription='Set balloon to "0" to disable'
        />

        <VmHardwareStorageSection
          storageField={
            <form.AppField name="storage">
              {(field) => (
                <Field>
                  <FieldLabel>Disk</FieldLabel>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <SelectValue placeholder="Select disk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Storage Targets</SelectLabel>
                        {diskStorages.map((storage) => (
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
                  <FieldError>
                    {renderError(field.state.meta.errors[0])}
                  </FieldError>
                </Field>
              )}
            </form.AppField>
          }
          diskSizeField={
            <form.AppField name="disk_size">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="iso-disk-size">Capacity (GB)</FieldLabel>
                  <Input
                    id="iso-disk-size"
                    type="number"
                    min={1}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        parseNumberInput(event.target.value, 32)
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
            </form.AppField>
          }
        />

        <VmHardwareNetworkSection>
          <form.Field name="networks" mode="array">
            {(networksField) => (
              <div className="flex flex-col gap-4">
                {networksField.state.value.map((_, index) => (
                  <VmHardwareNetworkCard
                    key={`network-${index}`}
                    title={`net${index}`}
                    description="Configure connectivity for this interface."
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
                                networkInterfaceSchema.shape.bridge.safeParse(
                                  value
                                )
                              ),
                          }}
                        >
                          {(field) => (
                            <Field
                              data-invalid={
                                field.state.meta.errors.length > 0 || undefined
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

                        <form.Field name={`networks[${index}].model` as const}>
                          {(field) => (
                            <Field>
                              <FieldLabel>Model</FieldLabel>
                              <Select
                                value={field.state.value}
                                onValueChange={(value) =>
                                  field.handleChange(value ?? "virtio")
                                }
                                items={nicModels}
                              >
                                <SelectTrigger>
                                  <SelectValue />
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

                      <form.Field name={`networks[${index}].vlan_tag` as const}>
                        {(field) => (
                          <Field
                            data-invalid={
                              field.state.meta.errors.length > 0 || undefined
                            }
                          >
                            <FieldLabel htmlFor={`network-vlan-${index}`}>
                              VLAN Tag
                            </FieldLabel>
                            <Input
                              id={`network-vlan-${index}`}
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
                                field.state.meta.errors.length > 0 || undefined
                              }
                            />
                            <FieldError>
                              {renderError(field.state.meta.errors[0])}
                            </FieldError>
                          </Field>
                        )}
                      </form.Field>

                      <form.Field name={`networks[${index}].firewall` as const}>
                        {(field) => (
                          <Field orientation="horizontal">
                            <Checkbox
                              id={`network-firewall-${index}`}
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(Boolean(checked))
                              }
                            />
                            <FieldContent>
                              <FieldLabel htmlFor={`network-firewall-${index}`}>
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
    )
  },
})
