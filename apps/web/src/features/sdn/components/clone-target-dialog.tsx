import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Add01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
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
import type { ComponentType } from "react"
import type { z } from "zod"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type { CloneTargetFormValues } from "@/features/sdn/components/clone-target-dialog-utils"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { formatFieldError, isTouchedInvalid } from "@/components/forms/form-errors"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  createPodCloneTarget,
  podCloneTargetsQueryOptions,
  updatePodCloneTarget,
} from "@/features/pods/api/clone-targets-api"
import {
  buildCloneTargetPayload,
  cloneTargetBridgeSchema,
  cloneTargetKeySchema,
  cloneTargetLabelSchema,
  cloneTargetNetworkFileSchema,
  cloneTargetStorageSchema,
  cloneTargetUserPatternSchema,
  cloneTargetVNetSchema,
  cloneTargetWANIPBaseSchema,
  getDefaultCloneTargetFormValues,
} from "@/features/sdn/components/clone-target-dialog-utils"

type AppFieldComponent = ComponentType<any>

function getFirstIssueMessage(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? undefined : result.error.issues[0]?.message
}

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
              />
            </FieldContent>
            {isInvalid ? (
              <FieldError>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            ) : description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
          </Field>
        )
      }}
    </FieldComponent>
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
        <FieldGroup>
          <CloneTargetTextField
            FieldComponent={form.Field}
            name="key"
            label="Key"
            description="Stable identifier stored on published pods. Cannot be changed later."
            placeholder="lab2"
            schema={cloneTargetKeySchema}
            disabled={isEdit}
            maxLength={32}
          />
          <CloneTargetTextField
            FieldComponent={form.Field}
            name="label"
            label="Label"
            placeholder="Lab 2"
            schema={cloneTargetLabelSchema}
            maxLength={48}
          />

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Networks</FieldLegend>
            <FieldDescription>
              Pod segments attach to these VLAN-aware VNets, and the cloned
              router&apos;s uplink is moved onto the WAN bridge.
            </FieldDescription>
            <FieldGroup>
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="lanVNet"
                label="LAN VNet"
                placeholder="pod"
                schema={cloneTargetVNetSchema}
                maxLength={8}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="dmzVNet"
                label="DMZ VNet"
                placeholder="dmz"
                schema={cloneTargetVNetSchema}
                maxLength={8}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="wanBridge"
                label="WAN bridge"
                description="Proxmox bridge the cloned router's net0 is attached to."
                placeholder="vmbr0"
                schema={cloneTargetBridgeSchema}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="wanIPBase"
                label="WAN IP base"
                description="First two octets. Displayed as the pod's external subnet; the addresses themselves come from the cloud-init snippets below."
                placeholder="172.16."
                schema={cloneTargetWANIPBaseSchema}
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
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="cloudInitStorage"
                label="Storage"
                placeholder="local"
                schema={cloneTargetStorageSchema}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="cloudInitUserFilePattern"
                label="LAN user-data pattern"
                placeholder="kamino-router-{network}-user-data.yaml"
                schema={cloneTargetUserPatternSchema}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="cloudInitNetworkFile"
                label="LAN network-config file"
                placeholder="kamino-router-network-config.yaml"
                schema={cloneTargetNetworkFileSchema}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="lanDmzUserFilePattern"
                label="LAN + DMZ user-data pattern"
                placeholder="kamino-router-lan-dmz-{network}-user-data.yaml"
                schema={cloneTargetUserPatternSchema}
              />
              <CloneTargetTextField
                FieldComponent={form.Field}
                name="lanDmzNetworkFile"
                label="LAN + DMZ network-config file"
                placeholder="kamino-router-lan-dmz-network-config.yaml"
                schema={cloneTargetNetworkFileSchema}
              />
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </AppDialogScrollBody>

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
