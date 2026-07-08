import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import type { NetworkOption } from "@/features/vms/components/hardware/hardware-section-utils"
import { getSelectOptionLabel } from "@/features/vms/components/hardware/hardware-section-utils"
import { formatFieldError } from "@/features/vms/components/create/create-vm-step-utils"
import { parseOptionalNumberInput } from "@/features/vms/components/create/create-vm-form"
import { nicModels } from "@/features/vms/components/hardware/hardware-options"
import { VmHardwareNetworkCard } from "@/features/vms/components/hardware/hardware-sections"
import { VmHardwareNetworkBridgeCombobox } from "@/features/vms/components/hardware/vm-hardware-network-bridge-combobox"

type NetworkInterfaceValue = {
  id?: string
  device?: string
  mac_address?: string
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
}

type NetworksFormLike = {
  Field: any
}

type VmHardwareNetworksFieldProps = {
  form: NetworksFormLike
  bridgeOptions: Array<NetworkOption>
  vnetOptions: Array<NetworkOption>
  networkOptions: Array<NetworkOption>
  validateBridge: (value: string) => string | undefined
  fieldIdPrefix?: string
  resolveCardTitle?: (network: NetworkInterfaceValue, index: number) => string
  resolveCardDescription?: (network: NetworkInterfaceValue) => string
  resolveCardKey?: (network: NetworkInterfaceValue, index: number) => string
  createNetworkValue?: () => NetworkInterfaceValue
}

export function VmHardwareNetworksField({
  form,
  bridgeOptions,
  vnetOptions,
  networkOptions,
  validateBridge,
  fieldIdPrefix = "hardware-network",
  resolveCardTitle = (network, index) => network.device || `net${index}`,
  resolveCardDescription = (network) =>
    network.mac_address
      ? `MAC ${network.mac_address}`
      : "Configure connectivity for this interface.",
  resolveCardKey = (network, index) => network.device ?? `network-${index}`,
  createNetworkValue = () => ({
    bridge: "vmbr0",
    model: "virtio",
    firewall: true,
  }),
}: VmHardwareNetworksFieldProps) {
  return (
    <form.Field name="networks" mode="array">
      {(networksField: {
        state: { value: Array<NetworkInterfaceValue> }
        removeValue: (index: number) => void
        pushValue: (value: NetworkInterfaceValue) => void
      }) => (
        <div className="flex flex-col gap-4">
          {networksField.state.value.map((network, index) => (
            <VmHardwareNetworkCard
              key={resolveCardKey(network, index)}
              title={resolveCardTitle(network, index)}
              description={resolveCardDescription(network)}
              removeAction={
                networksField.state.value.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Remove network interface"
                    onClick={() => networksField.removeValue(index)}
                  >
                    <HugeiconsIcon icon={Delete01Icon} />
                  </Button>
                ) : undefined
              }
            >
              <FieldGroup>
                <div className="grid grid-cols-2 gap-6">
                  <form.Field
                    name={`networks[${index}].bridge`}
                    validators={{
                      onBlur: ({ value }: { value: string }) =>
                        validateBridge(value),
                    }}
                  >
                    {(field: {
                      state: {
                        value: string
                        meta: { errors: Array<unknown> }
                      }
                      handleBlur: () => void
                      handleChange: (value: string) => void
                    }) => (
                      <Field
                        data-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                      >
                        <FieldLabel>Bridge / VNet</FieldLabel>
                        <VmHardwareNetworkBridgeCombobox
                          bridgeOptions={bridgeOptions}
                          vnetOptions={vnetOptions}
                          networkOptions={networkOptions}
                          value={field.state.value}
                          invalid={field.state.meta.errors.length > 0}
                          onBlur={field.handleBlur}
                          onValueChange={field.handleChange}
                        />
                        <FieldError>
                          {formatFieldError(field.state.meta.errors[0])}
                        </FieldError>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name={`networks[${index}].model`}>
                    {(field: {
                      state: { value: string }
                      handleChange: (value: string) => void
                    }) => (
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

                <form.Field name={`networks[${index}].vlan_tag`}>
                  {(field: {
                    state: {
                      value?: number
                      meta: { errors: Array<unknown> }
                    }
                    handleBlur: () => void
                    handleChange: (value: number | undefined) => void
                  }) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor={`${fieldIdPrefix}-vlan-${index}`}>
                        VLAN Tag
                      </FieldLabel>
                      <Input
                        id={`${fieldIdPrefix}-vlan-${index}`}
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
                        {formatFieldError(field.state.meta.errors[0])}
                      </FieldError>
                    </Field>
                  )}
                </form.Field>

                <form.Field name={`networks[${index}].firewall`}>
                  {(field: {
                    state: { value: boolean }
                    handleChange: (value: boolean) => void
                  }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        id={`${fieldIdPrefix}-firewall-${index}`}
                        checked={field.state.value}
                        onCheckedChange={(checked) =>
                          field.handleChange(Boolean(checked))
                        }
                      />
                      <FieldContent>
                        <FieldLabel
                          htmlFor={`${fieldIdPrefix}-firewall-${index}`}
                        >
                          Firewall
                        </FieldLabel>
                        <FieldDescription>
                          Enable Proxmox firewall integration for this NIC.
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
              onClick={() => networksField.pushValue(createNetworkValue())}
            >
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              Add Network Interface
            </Button>
          </div>
        </div>
      )}
    </form.Field>
  )
}
