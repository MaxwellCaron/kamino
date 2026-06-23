import { useMemo } from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconEdit, IconNetwork, IconPlus } from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
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
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import { formatToastError } from "@/features/shared/utils/format"
import {
  formatFieldError,
  isTouchedInvalid,
} from "@/components/forms/form-errors"
import {
  createVNet,
  sdnZonesQueryOptions,
  updateVNet,
} from "@/features/sdn/api/sdn-api"

const REQUIRED_TAG_ZONE_TYPES = new Set(["vlan", "vxlan", "evpn"])
const OPTIONAL_TAG_ZONE_TYPES = new Set(["qinq", "faucet"])

type TagRule = "disabled" | "required" | "optional"

function getTagRule(zoneType: string | undefined): TagRule {
  if (!zoneType || zoneType === "simple") return "disabled"
  if (REQUIRED_TAG_ZONE_TYPES.has(zoneType)) return "required"
  if (OPTIONAL_TAG_ZONE_TYPES.has(zoneType)) return "optional"
  return "optional"
}

function isVlanAwareDisabled(zoneType: string | undefined): boolean {
  return !zoneType || zoneType === "evpn"
}

const vnetIdSchema = z
  .string()
  .trim()
  .min(2, "Must be 2-8 characters")
  .max(8, "Must be 2-8 characters")
  .regex(
    /^[A-Za-z][A-Za-z0-9]*$/,
    "Must start with a letter, letters and numbers only"
  )

const aliasSchema = z
  .string()
  .trim()
  .max(256, "Must be 256 characters or fewer")

const zoneSchema = z.string().trim().min(1, "Zone is required")

function getFirstIssueMessage(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? undefined : result.error.issues[0]?.message
}

function validateTag(value: string, zoneType: string | undefined) {
  const rule = getTagRule(zoneType)
  if (rule === "disabled") return undefined

  const trimmed = value.trim()
  if (trimmed === "") {
    return rule === "required"
      ? "Tag is required for this zone type"
      : undefined
  }

  const tag = Number(trimmed)
  if (!Number.isInteger(tag) || tag < 1 || tag > 16777215) {
    return "Tag must be a whole number between 1 and 16777215"
  }
  return undefined
}

export function VNetDialog({
  vnet,
  open,
  onOpenChange,
}: {
  vnet?: ApiVNet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!vnet
  const queryClient = useQueryClient()

  const {
    data: zonesData,
    error: zonesError,
    isLoading: isZonesLoading,
  } = useQuery({ ...sdnZonesQueryOptions, enabled: open })

  const zones = useMemo(
    () => [...(zonesData ?? [])].sort((a, b) => a.zone.localeCompare(b.zone)),
    [zonesData]
  )
  const zonesByName = useMemo(
    () => new Map(zones.map((zone) => [zone.zone, zone])),
    [zones]
  )
  const zonesUnavailable = !isZonesLoading && !zonesError && zones.length === 0

  const mutation = useMutation({
    mutationFn: async (values: {
      vnet: string
      zone: string
      tag: string
      alias: string
      vlanAware: boolean
      isolatePorts: boolean
    }) => {
      const tag = values.tag.trim() ? parseInt(values.tag, 10) : undefined
      if (isEdit) {
        await updateVNet(vnet.vnet, {
          zone: values.zone,
          tag,
          alias: values.alias || undefined,
          vlanaware: values.vlanAware,
          isolate_ports: values.isolatePorts,
        })
      } else {
        await createVNet({
          vnet: values.vnet,
          zone: values.zone,
          tag,
          alias: values.alias || undefined,
          vlanaware: values.vlanAware,
          isolate_ports: values.isolatePorts,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
      form.reset()
    },
  })

  const form = useForm({
    defaultValues: {
      vnet: vnet?.vnet ?? "",
      zone: vnet?.zone ?? "",
      tag: vnet?.tag?.toString() ?? "",
      alias: vnet?.alias ?? "",
      vlanAware: vnet?.vlanaware ?? true,
      isolatePorts: vnet?.isolate_ports ?? false,
    },
    onSubmit: ({ value }) => {
      onOpenChange(false)
      toast.promise(mutation.mutateAsync(value), {
        loading: isEdit ? "Updating VNet..." : "Creating VNet...",
        success: isEdit ? "VNet updated" : "VNet created",
        error: formatToastError,
      })
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={isEdit ? IconEdit : IconPlus}
      title={isEdit ? "Edit VNet" : "Create VNet"}
      description={
        isEdit
          ? `Update the virtual network configuration for ${vnet.vnet}.`
          : "Create a new SDN virtual network."
      }
    >
      {zonesError ? (
        <InlineErrorAlert
          error={zonesError}
          fallback="Failed to load SDN zones."
        />
      ) : isZonesLoading ? (
        <DialogBodySkeleton rows={4} />
      ) : (
        <form
          action={() => {
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="vnet"
              validators={{
                onBlur: ({ value }) =>
                  getFirstIssueMessage(vnetIdSchema.safeParse(value)),
                onSubmit: ({ value }) =>
                  getFirstIssueMessage(vnetIdSchema.safeParse(value)),
              }}
            >
              {(field) => {
                const isInvalid = isTouchedInvalid(field.state.meta)

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="vnet">VNet ID</FieldLabel>
                    <FieldContent>
                      <Input
                        id="vnet"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        disabled={isEdit}
                        placeholder="pod245"
                        maxLength={8}
                        aria-invalid={isInvalid}
                      />
                    </FieldContent>
                    {isInvalid && (
                      <FieldError>
                        {formatFieldError(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field
              name="alias"
              validators={{
                onBlur: ({ value }) =>
                  getFirstIssueMessage(aliasSchema.safeParse(value)),
                onSubmit: ({ value }) =>
                  getFirstIssueMessage(aliasSchema.safeParse(value)),
              }}
            >
              {(field) => {
                const isInvalid = isTouchedInvalid(field.state.meta)

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="alias">Alias</FieldLabel>
                    <FieldContent>
                      <Input
                        id="alias"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="Optional description"
                        aria-invalid={isInvalid}
                      />
                    </FieldContent>
                    {isInvalid && (
                      <FieldError>
                        {formatFieldError(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field
              name="zone"
              validators={{
                onBlur: ({ value }) =>
                  getFirstIssueMessage(zoneSchema.safeParse(value)),
                onSubmit: ({ value }) =>
                  getFirstIssueMessage(zoneSchema.safeParse(value)),
              }}
            >
              {(field) => {
                const isInvalid = isTouchedInvalid(field.state.meta)

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="zone">Zone</FieldLabel>
                    <FieldContent>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) => {
                          const next = value ?? ""
                          field.handleChange(next)

                          const zoneType = zonesByName.get(next)?.type
                          if (getTagRule(zoneType) === "disabled") {
                            form.setFieldValue("tag", "")
                          }
                          if (isVlanAwareDisabled(zoneType)) {
                            form.setFieldValue("vlanAware", false)
                          }
                        }}
                        disabled={zonesUnavailable}
                      >
                        <SelectTrigger
                          id="zone"
                          aria-invalid={isInvalid}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select a zone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {zones.map((zone) => (
                              <SelectItem key={zone.zone} value={zone.zone}>
                                {zone.zone}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FieldContent>
                    {isInvalid && (
                      <FieldError>
                        {formatFieldError(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                )
              }}
            </form.Field>

            {zonesUnavailable && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconNetwork />
                  </EmptyMedia>
                  <EmptyTitle>No SDN zones available</EmptyTitle>
                  <EmptyDescription>
                    Configure an SDN zone in Proxmox before creating a VNet.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            <form.Subscribe selector={(state) => state.values.zone}>
              {(zoneValue) => {
                const zoneType = zonesByName.get(zoneValue)?.type
                const tagRule = getTagRule(zoneType)
                const tagDisabled = tagRule === "disabled"
                const vlanAwareDisabled = isVlanAwareDisabled(zoneType)

                return (
                  <>
                    <form.Field
                      name="tag"
                      validators={{
                        onBlur: ({ value }) => validateTag(value, zoneType),
                        onSubmit: ({ value }) => validateTag(value, zoneType),
                      }}
                    >
                      {(field) => {
                        const isInvalid = isTouchedInvalid(field.state.meta)

                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor="tag">Tag</FieldLabel>
                            <FieldContent>
                              <Input
                                id="tag"
                                type="number"
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                disabled={tagDisabled}
                                placeholder={
                                  tagRule === "required" ? "1245" : "Optional"
                                }
                                aria-invalid={isInvalid}
                              />
                            </FieldContent>
                            {isInvalid && (
                              <FieldError>
                                {formatFieldError(field.state.meta.errors[0])}
                              </FieldError>
                            )}
                          </Field>
                        )
                      }}
                    </form.Field>

                    <form.Field name="isolatePorts">
                      {(field) => (
                        <FieldLabel
                          htmlFor={field.name}
                          className="cursor-pointer"
                        >
                          <Field orientation="horizontal">
                            <Checkbox
                              id={field.name}
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(!!checked)
                              }
                            />
                            <FieldContent>
                              <FieldTitle>Isolate Ports</FieldTitle>
                              <FieldDescription>
                                Prevent guests on this VNet from communicating
                                with each other directly through the bridge.
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        </FieldLabel>
                      )}
                    </form.Field>

                    <form.Field name="vlanAware">
                      {(field) => (
                        <FieldLabel
                          htmlFor={field.name}
                          data-disabled={vlanAwareDisabled || undefined}
                          className="cursor-pointer data-[disabled=true]:cursor-not-allowed"
                        >
                          <Field orientation="horizontal">
                            <Checkbox
                              id={field.name}
                              checked={field.state.value}
                              disabled={vlanAwareDisabled}
                              onCheckedChange={(checked) =>
                                field.handleChange(!!checked)
                              }
                            />
                            <FieldContent>
                              <FieldTitle>VLAN Aware</FieldTitle>
                              <FieldDescription>
                                {vlanAwareDisabled
                                  ? "Unavailable when no zone is selected or the zone type is EVPN."
                                  : "Allow VLAN-tagged traffic to pass through this VNet to guests."}
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        </FieldLabel>
                      )}
                    </form.Field>
                  </>
                )
              }}
            </form.Subscribe>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <AppDialogPrimaryButton
                  pending={isSubmitting}
                  pendingLabel={isEdit ? "Saving..." : "Creating..."}
                  disabled={zonesUnavailable}
                >
                  {isEdit ? "Save" : "Create"}
                </AppDialogPrimaryButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      )}
    </AppDialog>
  )
}
