import { useMemo, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Globe02Icon,
  PencilEdit01Icon,
  RegexIcon,
} from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import type {
  ApiSDNZone,
  ApiVNet,
  CreateVNetInput,
} from "@/features/sdn/types/sdn-types"
import type {
  VNetCreateMode,
  VNetFormValues,
} from "@/features/sdn/components/vnet-dialog-utils"
import type { MutationItemUpdate } from "@/components/feedback/mutation-progress-toast"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import {
  applySDN,
  createVNet,
  createVNets,
  sdnZonesQueryOptions,
  updateVNet,
} from "@/features/sdn/api/sdn-api"
import { CreateVNetSingleForm } from "@/features/sdn/components/create-vnet-single-form"
import { CreateVNetsPrefixForm } from "@/features/sdn/components/create-vnet-prefix-form"
import { EditVNetForm } from "@/features/sdn/components/edit-vnet-form"
import {
  buildCreateVNets,
  getDefaultVNetFormValues,
  getTagRule,
  isVlanAwareDisabled,
} from "@/features/sdn/components/vnet-dialog-utils"

const SDN_APPLY_ITEM_ID = "sdn-apply"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed"
}

function getSDNApplyProgressItem() {
  return {
    id: SDN_APPLY_ITEM_ID,
    name: "SDN Apply",
    successDescription: "Applied",
    retry: applySDN,
  }
}

async function reportSDNApply(report: (update: MutationItemUpdate) => void) {
  try {
    await applySDN()
    report({ id: SDN_APPLY_ITEM_ID, status: "done" })
  } catch (error) {
    report({
      id: SDN_APPLY_ITEM_ID,
      status: "error",
      error: getErrorMessage(error),
    })
  }
}

function VNetCreateFields({
  FieldComponent,
  SubscribeComponent,
  mode,
  setMode,
  zones,
  zonesByName,
  zonesUnavailable,
  onZoneChange,
}: {
  FieldComponent: any
  SubscribeComponent: any
  mode: VNetCreateMode
  setMode: (mode: VNetCreateMode) => void
  zones: Array<{ zone: string; type?: string }>
  zonesByName: Map<string, { zone: string; type?: string }>
  zonesUnavailable: boolean
  onZoneChange: (nextZone: string) => void
}) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as VNetCreateMode)}
      className="gap-4"
    >
      <TabsList className="w-full border-b" variant="line">
        <TabsTrigger value="single">
          <HugeiconsIcon icon={Globe02Icon} />
          Single
        </TabsTrigger>
        <TabsTrigger value="prefix">
          <HugeiconsIcon icon={RegexIcon} />
          Prefix
        </TabsTrigger>
      </TabsList>

      <TabsContent value="single">
        <CreateVNetSingleForm
          FieldComponent={FieldComponent}
          SubscribeComponent={SubscribeComponent}
          zones={zones}
          zonesByName={zonesByName}
          zonesUnavailable={zonesUnavailable}
          onZoneChange={onZoneChange}
        />
      </TabsContent>

      <TabsContent value="prefix">
        <CreateVNetsPrefixForm
          FieldComponent={FieldComponent}
          SubscribeComponent={SubscribeComponent}
          zones={zones}
          zonesByName={zonesByName}
          zonesUnavailable={zonesUnavailable}
          onZoneChange={onZoneChange}
        />
      </TabsContent>
    </Tabs>
  )
}

function VNetDialogFooter({
  SubscribeComponent,
  isEdit,
  mode,
  zonesUnavailable,
}: {
  SubscribeComponent: any
  isEdit: boolean
  mode: VNetCreateMode
  zonesUnavailable: boolean
}) {
  return (
    <DialogFooter className="mt-6">
      <SubscribeComponent selector={(state: any) => state.isSubmitting}>
        {(isSubmitting: boolean) => (
          <AppDialogPrimaryButton
            pending={isSubmitting}
            pendingLabel={isEdit ? "Saving..." : "Creating..."}
            disabled={zonesUnavailable}
          >
            {isEdit ? "Save" : mode === "prefix" ? "Create VNets" : "Create"}
          </AppDialogPrimaryButton>
        )}
      </SubscribeComponent>
    </DialogFooter>
  )
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
  const {
    data: zonesData,
    error: zonesError,
    isLoading: isZonesLoading,
  } = useQuery({ ...sdnZonesQueryOptions, enabled: open })

  const zones = useMemo(
    () => (zonesData ?? []).toSorted((a, b) => a.zone.localeCompare(b.zone)),
    [zonesData]
  )
  const zonesByName = useMemo(
    () => new Map(zones.map((zone) => [zone.zone, zone])),
    [zones]
  )
  const zonesUnavailable = !isZonesLoading && !zonesError && zones.length === 0
  const defaultZone = zones[0]?.zone ?? ""

  if (zonesError || isZonesLoading) {
    return (
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        initialFocus={false}
        icon={isEdit ? PencilEdit01Icon : Add01Icon}
        title={isEdit ? "Edit VNet" : "Create VNets"}
        description={
          isEdit
            ? `Update VNet configuration for ${vnet.vnet}.`
            : "Create one or more VNets."
        }
      >
        {zonesError ? (
          <InlineErrorAlert
            error={zonesError}
            fallback="Failed to load SDN zones."
          />
        ) : (
          <DialogBodySkeleton rows={4} />
        )}
      </AppDialog>
    )
  }

  return (
    <VNetDialogForm
      vnet={vnet}
      open={open}
      onOpenChange={onOpenChange}
      zones={zones}
      zonesByName={zonesByName}
      zonesUnavailable={zonesUnavailable}
      defaultZone={defaultZone}
    />
  )
}

function VNetDialogForm({
  vnet,
  open,
  onOpenChange,
  zones,
  zonesByName,
  zonesUnavailable,
  defaultZone,
}: {
  vnet?: ApiVNet
  open: boolean
  onOpenChange: (open: boolean) => void
  zones: Array<ApiSDNZone>
  zonesByName: Map<string, ApiSDNZone>
  zonesUnavailable: boolean
  defaultZone: string
}) {
  const isEdit = !!vnet
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<VNetCreateMode>("single")

  const mutation = useMutation({
    mutationFn: async (values: VNetFormValues) => {
      if (!isEdit) return

      const tag = values.tag.trim() ? parseInt(values.tag, 10) : undefined
      await updateVNet(vnet.vnet, {
        zone: values.zone,
        tag,
        alias: values.alias || undefined,
        vlanaware: values.vlanAware,
        isolate_ports: values.isolatePorts,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
      form.reset()
    },
  })

  const form = useForm({
    defaultValues: getDefaultVNetFormValues(vnet, defaultZone || undefined),
    onSubmit: ({ value }) => {
      const zoneType = zonesByName.get(value.zone.trim())?.type

      if (isEdit) {
        onOpenChange(false)
        showSingleMutationToast({
          title: "Updating VNet",
          name: value.vnet,
          promise: () => mutation.mutateAsync(value),
          successDescription: "Updated",
        })
        return
      }

      if (mode === "single") {
        let payload: CreateVNetInput
        try {
          const [nextPayload] = buildCreateVNets("single", value, zoneType)
          payload = nextPayload
        } catch (error) {
          showSingleMutationToast({
            title: "Creating VNet",
            name: value.vnet || "VNet",
            promise: () =>
              Promise.reject(
                error instanceof Error ? error : new Error(String(error))
              ),
            successDescription: "Created",
          })
          return
        }

        onOpenChange(false)
        showUnitMutationToast({
          title: "Creating VNet",
          progressItems: [getSDNApplyProgressItem()],
          units: [
            {
              items: [
                {
                  id: payload.vnet,
                  name: payload.vnet,
                  successDescription: "Queued",
                  retry: async () => {
                    await createVNet(payload, { apply: false })
                    await applySDN()
                  },
                },
              ],
              run: async (report) => {
                try {
                  await createVNet(payload, { apply: false })
                  report({ id: payload.vnet, status: "done" })
                } catch (error) {
                  report({
                    id: SDN_APPLY_ITEM_ID,
                    status: "error",
                    error: "Skipped because VNet creation failed",
                  })
                  throw error
                }

                await reportSDNApply(report)
              },
            },
          ],
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
            form.reset()
          },
        })
        return
      }

      let payload
      try {
        payload = buildCreateVNets("prefix", value, zoneType)
      } catch (error) {
        showSingleMutationToast({
          title: "Creating VNets",
          name: "Prefix",
          promise: () =>
            Promise.reject(
              error instanceof Error ? error : new Error(String(error))
            ),
          successDescription: "Created",
        })
        return
      }

      onOpenChange(false)
      showUnitMutationToast({
        title: "Creating VNets",
        progressItems: [getSDNApplyProgressItem()],
        units: [
          {
            items: payload.map((input) => ({
              id: input.vnet,
              name: input.vnet,
              successDescription: "Queued",
              retry: async () => {
                const result = await createVNets([input], { apply: false })
                const failure = result.failed.find(
                  (item) => item.id === input.vnet
                )
                if (failure) throw new Error(failure.error)
                await applySDN()
              },
            })),
            run: async (report) => {
              const result = await createVNets(payload, { apply: false })
              const errorsById = new Map(
                result.failed.map((failure) => [failure.id, failure.error])
              )
              for (const input of payload) {
                const error = errorsById.get(input.vnet)
                if (error) {
                  report({ id: input.vnet, status: "error", error })
                } else {
                  report({ id: input.vnet, status: "done" })
                }
              }

              if (result.created.length === 0) {
                report({
                  id: SDN_APPLY_ITEM_ID,
                  status: "error",
                  error: "Skipped because no VNets were queued",
                })
                return { failed: result.failed }
              }

              await reportSDNApply(report)
              return { failed: result.failed }
            },
          },
        ],
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
          form.reset()
          setMode("single")
        },
      })
    },
  })

  const handleZoneChange = (nextZone: string) => {
    const zoneType = zonesByName.get(nextZone)?.type
    if (getTagRule(zoneType) === "disabled") {
      form.setFieldValue("tag", "")
      form.setFieldValue("baseTag", "")
    }
    if (isVlanAwareDisabled(zoneType)) {
      form.setFieldValue("vlanAware", false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        form.reset(getDefaultVNetFormValues(vnet, defaultZone || undefined))
        setMode("single")
      }}
      initialFocus={false}
      icon={isEdit ? PencilEdit01Icon : Add01Icon}
      title={isEdit ? "Edit VNet" : "Create VNets"}
      description={
        isEdit
          ? `Update VNet configuration for ${vnet.vnet}.`
          : "Create one or more VNets."
      }
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        {isEdit ? (
          <EditVNetForm
            FieldComponent={form.Field}
            SubscribeComponent={form.Subscribe}
            zones={zones}
            zonesByName={zonesByName}
            zonesUnavailable={zonesUnavailable}
            onZoneChange={handleZoneChange}
          />
        ) : (
          <VNetCreateFields
            FieldComponent={form.Field}
            SubscribeComponent={form.Subscribe}
            mode={mode}
            setMode={setMode}
            zones={zones}
            zonesByName={zonesByName}
            zonesUnavailable={zonesUnavailable}
            onZoneChange={handleZoneChange}
          />
        )}

        <VNetDialogFooter
          SubscribeComponent={form.Subscribe}
          isEdit={isEdit}
          mode={mode}
          zonesUnavailable={zonesUnavailable}
        />
      </form>
    </AppDialog>
  )
}
