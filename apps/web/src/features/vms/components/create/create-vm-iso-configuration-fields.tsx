import { HugeiconsIcon } from "@hugeicons/react"
import { BoltIcon, Settings01Icon } from "@hugeicons/core-free-icons"
import {
  Field,
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
  createVmFormOptions,
  getFirstIssueMessage,
  networkInterfaceSchema,
  optionalVmidSchema,
  parseNumberInput,
  withCreateVmForm,
} from "./create-vm-form"
import { formatFieldError } from "./create-vm-step-utils"
import type { ApiISO, ApiNode, ApiStorage } from "@/features/vms/types/vm-types"
import type { NetworkData } from "./create-vm-step-utils"
import { buildVmHardwareNetworkOptions } from "@/features/vms/components/hardware/hardware-section-utils"
import { validateVMID } from "@/features/vms/api/vm-api"
import {
  biosTypes,
  cpuTypes,
  machineTypes,
  osTypes,
  scsiControllers,
} from "@/features/vms/components/hardware/hardware-options"
import {
  VmHardwareComputeSection,
  VmHardwareCpuBlock,
  VmHardwareMemoryBlock,
  VmHardwareNetworkSection,
  VmHardwareOperatingSystemSection,
  VmHardwareStorageSection,
} from "@/features/vms/components/hardware/hardware-sections"
import { VmHardwareNetworksField } from "@/features/vms/components/hardware/vm-hardware-networks-field"
import { replaceWhitespaceWithHyphen } from "@/features/shared/utils/sanitize"
import { vmNameSchema } from "@/features/vms/utils/vm-name"

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
            <HugeiconsIcon icon={Settings01Icon} className="size-4" />
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
                    onChange={(event) =>
                      field.handleChange(
                        replaceWhitespaceWithHyphen(event.target.value)
                      )
                    }
                    placeholder="ubuntu-01"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>
                    {formatFieldError(field.state.meta.errors[0])}
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
                      {formatFieldError(field.state.meta.errors[0])}
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
                      {formatFieldError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>
            </div>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <VmHardwareOperatingSystemSection
          legendIcon={<HugeiconsIcon icon={BoltIcon} className="size-4" />}
          description="Select the guest OS type and the ISO that should boot the VM."
        >
          <form.AppField name="iso_storage">
            {(field) => (
              <Field>
                <FieldLabel>ISO Storage</FieldLabel>
                <Select
                  value={field.state.value ?? ""}
                  onValueChange={(value) => {
                    field.handleChange(value ?? "")
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
                  {formatFieldError(field.state.meta.errors[0])}
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
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.AppField>

          <form.AppField name="ostype">
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

          <div className="grid grid-cols-2 gap-6">
            <form.AppField name="bios">
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

            <form.AppField name="machine">
              {(field) => (
                <Field>
                  <FieldLabel>Machine Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "pc")}
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
          </div>

          <form.AppField name="scsi">
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
        </VmHardwareOperatingSystemSection>

        <VmHardwareComputeSection description="Configure the virtual CPU, firmware, and memory profile.">
          <VmHardwareCpuBlock>
            <div className="grid grid-cols-2 gap-6">
              <form.AppField name="sockets">
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
                      {formatFieldError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>

              <form.AppField name="cores">
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
                      {formatFieldError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>
            </div>

            <form.AppField name="cpu_type">
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
          </VmHardwareCpuBlock>

          <VmHardwareMemoryBlock balloonDescription='Set balloon to "0" to disable'>
            <div className="grid grid-cols-2 gap-6">
              <form.AppField name="memory">
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
                      {formatFieldError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>

              <form.AppField name="balloon">
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
                      {formatFieldError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>
            </div>
          </VmHardwareMemoryBlock>
        </VmHardwareComputeSection>

        <VmHardwareStorageSection>
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
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.AppField>

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
                    field.handleChange(parseNumberInput(event.target.value, 32))
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
                <FieldError>
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.AppField>
        </VmHardwareStorageSection>

        <VmHardwareNetworkSection>
          <VmHardwareNetworksField
            form={form}
            bridgeOptions={bridgeOptions}
            vnetOptions={vnetOptions}
            networkOptions={networkOptions}
            fieldIdPrefix="network"
            resolveCardTitle={(_, index) => `net${index}`}
            resolveCardDescription={() =>
              "Configure connectivity for this interface."
            }
            resolveCardKey={(network, index) =>
              `${network.bridge}-${network.model}-${network.vlan_tag ?? "none"}-${index}`
            }
            validateBridge={(value) =>
              getFirstIssueMessage(
                networkInterfaceSchema.shape.bridge.safeParse(value)
              )
            }
          />
        </VmHardwareNetworkSection>
      </div>
    )
  },
})
