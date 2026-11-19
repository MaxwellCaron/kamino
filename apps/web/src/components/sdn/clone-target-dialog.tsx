import {
  Add01Icon,
  PencilEdit01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@workspace/ui/components/code-block"
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
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  POD_NETWORK_PROFILES,
  podNetworkProfileHasDMZ,
} from "@/lib/pods/pod-networking-mode"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  bridgesQueryOptions,
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/lib/vms/proxmox-options-api"
import {
  buildCloneTargetPayload,
  buildSnippetCommand,
  cloneTargetBridgeSchema,
  cloneTargetKeySchema,
  cloneTargetLabelSchema,
  cloneTargetNetworkNumberSchema,
  cloneTargetSnippetDirSchema,
  cloneTargetStorageSchema,
  cloneTargetVNetSchema,
  cloneTargetWANSubnetSchema,
  formatPodWANSubnet,
  getDefaultCloneTargetFormValues,
} from "@/lib/sdn/clone-target-dialog-utils"
import {
  createPodCloneTarget,
  podCloneTargetsQueryOptions,
  updatePodCloneTarget,
} from "@/lib/pods/clone-targets-api"
import {
  formatFieldError,
  getFirstIssueMessage,
  isTouchedInvalid,
} from "@/lib/forms/form-errors"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CloneTargetFormValues } from "@/lib/sdn/clone-target-dialog-utils"
import type { ComponentType } from "react"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { Input } from "@workspace/ui/components/input"
import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"
import { Switch } from "@workspace/ui/components/switch"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useForm } from "@tanstack/react-form"
import { useHighlightedCode } from "@workspace/ui/hooks/use-highlighted-code"
import { vnetsQueryOptions } from "@/lib/sdn/sdn-api"
import type { z } from "zod"

type AppFieldComponent = ComponentType<any>

function CloneTargetTextField({
  FieldComponent,
  name,
  label,
  description,
  placeholder,
  schema,
  disabled,
  maxLength,
}: {
  FieldComponent: AppFieldComponent
  name: keyof CloneTargetFormValues
  label: string
  description?: string
  placeholder?: string
  schema: z.ZodType<string>
  disabled?: boolean
  maxLength?: number
}) {
  return (
    <FieldComponent
      name={name}
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(schema.safeParse(value)),
        onSubmit: ({ value }: { value: string }) =>
          getFirstIssueMessage(schema.safeParse(value)),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)
        const errorId = `${name}-error`

        return (
          <Field data-invalid={isInvalid} data-disabled={disabled}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <FieldContent>
              <Input
                id={name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                maxLength={maxLength}
                aria-invalid={isInvalid}
                aria-errormessage={isInvalid ? errorId : undefined}
              />
            </FieldContent>
            {isInvalid && (
              <FieldError id={errorId}>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            )}
            {description && <FieldDescription>{description}</FieldDescription>}
          </Field>
        )
      }}
    </FieldComponent>
  )
}

// Suggestions come from Proxmox, but any value is accepted: a bridge or storage
// may exist only on a node this list did not come from.
function CloneTargetComboboxField({
  FieldComponent,
  name,
  label,
  description,
  placeholder,
  schema,
  suggestions,
  emptyMessage,
}: {
  FieldComponent: AppFieldComponent
  name: keyof CloneTargetFormValues
  label: string
  description?: string
  placeholder?: string
  schema: z.ZodType<string>
  suggestions: Array<string>
  emptyMessage: string
}) {
  return (
    <FieldComponent
      name={name}
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(schema.safeParse(value)),
        onSubmit: ({ value }: { value: string }) =>
          getFirstIssueMessage(schema.safeParse(value)),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)
        const errorId = `${name}-error`
        const selected = suggestions.includes(field.state.value)
          ? field.state.value
          : null

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <FieldContent>
              <Combobox
                items={suggestions}
                itemToStringValue={(item) => item}
                value={selected}
                onValueChange={(item) => field.handleChange(item ?? "")}
                onInputValueChange={(value) => field.handleChange(value)}
                autoHighlight
              >
                <ComboboxInput
                  id={name}
                  placeholder={placeholder}
                  onBlur={field.handleBlur}
                  aria-invalid={isInvalid}
                  aria-errormessage={isInvalid ? errorId : undefined}
                />
                <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
                <ComboboxContent>
                  <ComboboxList>
                    {(item: string) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </FieldContent>
            {isInvalid && (
              <FieldError id={errorId}>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            )}
            {description && <FieldDescription>{description}</FieldDescription>}
          </Field>
        )
      }}
    </FieldComponent>
  )
}

function CloneTargetProfileField({
  FieldComponent,
}: {
  FieldComponent: AppFieldComponent
}) {
  return (
    <FieldComponent name="networkProfileKey">
      {(field: any) => (
        <Field>
          <FieldLabel>Network profile</FieldLabel>
          <FieldDescription>
            A LAN + DMZ target carries a DMZ VNet and can host pods of either
            profile. A LAN Router target hosts LAN-only pods.
          </FieldDescription>
          <RadioGroup
            aria-label="Network profile"
            value={field.state.value}
            onValueChange={(value) => field.handleChange(String(value))}
            className="gap-2"
          >
            {POD_NETWORK_PROFILES.map((profile) => (
              <FieldLabel
                key={profile.key}
                htmlFor={`clone-target-profile-${profile.key}`}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem
                    id={`clone-target-profile-${profile.key}`}
                    value={profile.key}
                  />
                  <FieldContent>
                    <FieldTitle className="text-sm leading-snug">
                      {profile.label}
                    </FieldTitle>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </Field>
      )}
    </FieldComponent>
  )
}

function CloneTargetSnippetCommand({
  values,
}: {
  values: CloneTargetFormValues
}) {
  const command = buildSnippetCommand(values)
  const lines = useHighlightedCode(command, "bash")

  return (
    <Field>
      <FieldLabel>Snippet generator command</FieldLabel>
      <FieldDescription>
        Run this on the Proxmox host to create the cloud-init files this target
        expects.
      </FieldDescription>
      <CodeBlock>
        <CodeBlockHeader>
          <CodeBlockTitle>
            <HugeiconsIcon icon={SourceCodeIcon} aria-hidden="true" />
            bash
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton value={command} />
          </CodeBlockActions>
        </CodeBlockHeader>
        <CodeBlockContent lineNumbers>
          {command.split("\n").map((line, index) => (
            <CodeBlockLine key={line.split("=")[0]}>
              {lines[index]}
            </CodeBlockLine>
          ))}
        </CodeBlockContent>
      </CodeBlock>
    </Field>
  )
}

export function CloneTargetDialog({
  target,
  open,
  onOpenChange,
}: {
  target?: PodCloneTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!target

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={isEdit ? PencilEdit01Icon : Add01Icon}
      title={isEdit ? "Edit Clone Target" : "Create Clone Target"}
      description={
        isEdit
          ? `Update where pods bound to ${target.label} are cloned.`
          : "Define a subnet and bridge that published pods can be cloned onto."
      }
    >
      <CloneTargetForm
        target={target}
        onOpenChange={onOpenChange}
        key={target?.key ?? "create"}
      />
    </AppDialog>
  )
}

function CloneTargetForm({
  target,
  onOpenChange,
}: {
  target?: PodCloneTarget
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!target
  const queryClient = useQueryClient()

  const { data: vnets } = useQuery(vnetsQueryOptions)
  const { data: nodes } = useQuery(nodesQueryOptions)
  const primaryNode = nodes?.at(0)?.node ?? ""
  const { data: bridgeData } = useQuery(bridgesQueryOptions(primaryNode))
  const { data: storages } = useQuery(storagesQueryOptions(primaryNode))

  const vnetNames = (vnets ?? []).map((vnet) => vnet.vnet).toSorted()
  // Proxmox materializes each VNet as a bridge, so either is valid for the uplink.
  const bridgeNames = [
    ...new Set([
      ...(bridgeData?.bridges ?? []).map((bridge) => bridge.iface),
      ...vnetNames,
    ]),
  ].toSorted()

  // Only snippet-capable storages can hold the router's cloud-init files.
  const storageNames: Array<string> = []
  for (const storage of storages ?? []) {
    if (storage.content.includes("snippets")) {
      storageNames.push(storage.storage)
    }
  }
  storageNames.sort()

  const mutation = useMutation({
    mutationFn: async (values: CloneTargetFormValues) => {
      const payload = buildCloneTargetPayload(values)
      if (isEdit) {
        const { key: _key, ...rest } = payload
        await updatePodCloneTarget(target.key, rest)
        return
      }
      await createPodCloneTarget(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: podCloneTargetsQueryOptions.queryKey,
      })
    },
  })

  const form = useForm({
    defaultValues: getDefaultCloneTargetFormValues(target),
    onSubmit: ({ value }) => {
      onOpenChange(false)
      showSingleMutationToast({
        title: isEdit ? "Updating clone target" : "Creating clone target",
        name: value.label || value.key,
        promise: () => mutation.mutateAsync(value),
        successDescription: isEdit ? "Updated" : "Created",
      })
    },
  })

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <AppDialogScrollBody>
        <form.Subscribe>
          {(state) => {
            const hasDMZ = podNetworkProfileHasDMZ(
              state.values.networkProfileKey
            )

            return (
              <FieldGroup>
                <CloneTargetTextField
                  FieldComponent={form.Field}
                  name="label"
                  label="Label"
                  description="Display name shown when publishing a pod. Safe to rename at any time."
                  placeholder="Lab 2"
                  schema={cloneTargetLabelSchema}
                  maxLength={48}
                />
                <CloneTargetTextField
                  FieldComponent={form.Field}
                  name="key"
                  label="Key"
                  description="Permanent identifier that published pods and clones are stored against. Cannot be changed after creation."
                  placeholder="lab2"
                  schema={cloneTargetKeySchema}
                  disabled={isEdit}
                  maxLength={32}
                />

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Assignments</FieldLegend>
                  <FieldDescription>
                    Assign this target to either system role. Saving an
                    assignment moves that role from its current target.
                  </FieldDescription>
                  <FieldGroup className="gap-3">
                    <form.Field name="isDefault">
                      {(field) => (
                        <FieldLabel
                          htmlFor={field.name}
                          className="cursor-pointer"
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle className="text-sm leading-snug">
                                Default
                              </FieldTitle>
                            </FieldContent>
                            <Switch
                              id={field.name}
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked)
                              }
                            />
                          </Field>
                        </FieldLabel>
                      )}
                    </form.Field>
                    <form.Field name="isPersonal">
                      {(field) => (
                        <FieldLabel
                          htmlFor={field.name}
                          className="cursor-pointer"
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle className="text-sm leading-snug">
                                Personal
                              </FieldTitle>
                            </FieldContent>
                            <Switch
                              id={field.name}
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked)
                              }
                            />
                          </Field>
                        </FieldLabel>
                      )}
                    </form.Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <CloneTargetProfileField FieldComponent={form.Field} />

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Networks</FieldLegend>
                  <FieldDescription>
                    Pod segments attach to these VLAN-aware VNets, and the
                    cloned router&apos;s uplink is moved onto the WAN bridge.
                  </FieldDescription>
                  <FieldGroup>
                    <CloneTargetComboboxField
                      FieldComponent={form.Field}
                      name="lanVNet"
                      label="LAN VNet"
                      placeholder="pod"
                      schema={cloneTargetVNetSchema}
                      suggestions={vnetNames}
                      emptyMessage="No matching VNets. You can still type a name."
                    />
                    {hasDMZ ? (
                      <CloneTargetComboboxField
                        FieldComponent={form.Field}
                        name="dmzVNet"
                        label="DMZ VNet"
                        placeholder="dmz"
                        schema={cloneTargetVNetSchema}
                        suggestions={vnetNames}
                        emptyMessage="No matching VNets. You can still type a name."
                      />
                    ) : null}
                    <CloneTargetComboboxField
                      FieldComponent={form.Field}
                      name="wanBridge"
                      label="WAN Bridge"
                      description="Bridge or VNet the cloned router's net0 is attached to."
                      placeholder="vmbr0"
                      schema={cloneTargetBridgeSchema}
                      suggestions={bridgeNames}
                      emptyMessage="No matching bridges or VNets. You can still type a name."
                    />
                    <CloneTargetTextField
                      FieldComponent={form.Field}
                      name="networkMin"
                      label="First Network Number"
                      description="Lowest inner VLAN tag this target allocates to pods."
                      placeholder="1"
                      schema={cloneTargetNetworkNumberSchema}
                    />
                    <CloneTargetTextField
                      FieldComponent={form.Field}
                      name="networkMax"
                      label="Last Network Number"
                      description="Highest inner VLAN tag this target allocates to pods."
                      placeholder="254"
                      schema={cloneTargetNetworkNumberSchema}
                    />
                    <CloneTargetTextField
                      FieldComponent={form.Field}
                      name="wanSubnet"
                      label="WAN Subnet"
                      description={`Each pod gets a /24 from this /16, using its network number as the third octet (${formatPodWANSubnet(state.values.wanSubnet || "172.16.0.0/16", "x")}).`}
                      placeholder="172.16.0.0/16"
                      schema={cloneTargetWANSubnetSchema}
                    />
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Router cloud-init</FieldLegend>
                  <FieldDescription>
                    Snippet files that must already exist on this storage, one
                    user-data file per network number.
                  </FieldDescription>
                  <FieldGroup>
                    <CloneTargetComboboxField
                      FieldComponent={form.Field}
                      name="cloudInitStorage"
                      label="Storage"
                      placeholder="local"
                      schema={cloneTargetStorageSchema}
                      suggestions={storageNames}
                      emptyMessage="No snippet-capable storages found. You can still type a name."
                    />
                    <CloneTargetTextField
                      FieldComponent={form.Field}
                      name="snippetDir"
                      label="Snippet Directory"
                      description="Where the generator writes the files on the Proxmox host. Feeds the command below only."
                      placeholder="/mnt/pve/mufasa-proxmox/snippets"
                      schema={cloneTargetSnippetDirSchema}
                    />
                    <CloneTargetSnippetCommand values={state.values} />
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            )
          }}
        </form.Subscribe>
      </AppDialogScrollBody>

      <form.Subscribe selector={(state) => state.canSubmit}>
        {(canSubmit) =>
          canSubmit ? null : (
            <FieldError>Correct the highlighted fields to continue.</FieldError>
          )
        }
      </form.Subscribe>

      <DialogFooter>
        <form.Subscribe>
          {(state) => (
            <AppDialogPrimaryButton pending={state.isSubmitting}>
              {isEdit ? "Save" : "Create"}
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
