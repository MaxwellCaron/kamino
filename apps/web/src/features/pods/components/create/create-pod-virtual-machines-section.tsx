import React from "react"
import { Image } from "@unpic/react"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy02Icon,
  Globe02Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons"
import { CreatePodTemplateCard } from "./create-pod-template-card"
import { syncSelectedTemplates } from "./create-pod-form"
import type {
  CreatePodFormApi,
  PodNetworkingMode,
  PodVmSegmentKey,
} from "./create-pod-form"
import type {
  PodNetworkProfile,
  PodTemplateOption,
} from "@/features/pods/api/create-pod-api"
import type { IconSvgElement } from "@hugeicons/react"

type CreatePodVirtualMachinesSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
  templateOptions: Array<PodTemplateOption>
  networkProfiles: Array<PodNetworkProfile>
  routerTemplateConfigured?: boolean
}

const networkingModeCards: Array<{
  value: PodNetworkingMode
  title: string
  description: string
  icon: IconSvgElement
  requiresRouter: boolean
  diagram?: {
    light: { src: string; width: number; height: number }
    dark: { src: string; width: number; height: number }
    alt: string
  }
}> = [
  {
    value: "lan-router-v1",
    title: "LAN Router",
    description:
      "One VyOS router with host-preserving 1:1 NAT into an isolated LAN.",
    icon: Globe02Icon,
    requiresRouter: true,
    diagram: {
      light: { src: "/lan_light.png", width: 440, height: 456 },
      dark: { src: "/lan_dark.png", width: 441, height: 456 },
      alt: "",
    },
  },
  {
    value: "lan-dmz-router-v1",
    title: "LAN + DMZ Router",
    description:
      "Isolated LAN and DMZ segments. DMZ hosts are 1:1 NAT from WAN to DMZ",
    icon: Shield01Icon,
    requiresRouter: true,
    diagram: {
      light: { src: "/lan_dmz_light.png", width: 456, height: 456 },
      dark: { src: "/lan_dmz_dark.png", width: 450, height: 456 },
      alt: "",
    },
  },
]

function getDefaultSegmentKey(
  networkingMode: PodNetworkingMode,
  networkProfiles: Array<PodNetworkProfile>
): PodVmSegmentKey | undefined {
  if (networkingMode !== "lan-dmz-router-v1") return undefined

  const profile = networkProfiles.find(
    (option) => option.key === "lan-dmz-router-v1"
  )
  const defaultSegment = profile?.default_segment_key

  return defaultSegment === "dmz" || defaultSegment === "lan"
    ? defaultSegment
    : "lan"
}

export function CreatePodVirtualMachinesSection({
  form,
  submissionAttempts,
  templateOptions,
  networkProfiles,
  routerTemplateConfigured = true,
}: CreatePodVirtualMachinesSectionProps) {
  const anchor = useComboboxAnchor()
  const templateIds = templateOptions.map((template) => template.id)
  const templateNamesById = new Map(
    templateOptions.map((template) => [template.id, template.name])
  )

  return (
    <FieldSet className="w-full">
      <FieldGroup>
        <form.Field name="networkingMode">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid

            const setNetworkingMode = (nextMode: PodNetworkingMode) => {
              field.handleChange(nextMode)

              if (nextMode === "lan-dmz-router-v1") {
                const defaultSegmentKey = getDefaultSegmentKey(
                  nextMode,
                  networkProfiles
                )
                const templates = form.getFieldValue("templates")
                form.setFieldValue(
                  "templates",
                  templates.map((template) => ({
                    ...template,
                    vms: template.vms.map((vm) => ({
                      ...vm,
                      segmentKey: vm.segmentKey ?? defaultSegmentKey,
                    })),
                  }))
                )
                return
              }

              const templates = form.getFieldValue("templates")
              form.setFieldValue(
                "templates",
                templates.map((template) => ({
                  ...template,
                  vms: template.vms.map(
                    ({ segmentKey: _segmentKey, ...vm }) => vm
                  ),
                }))
              )
            }

            return (
              <FieldSet data-invalid={isInvalid || undefined}>
                <FieldLegend>Automated Networking</FieldLegend>
                <FieldDescription>
                  {routerTemplateConfigured
                    ? "Choose how Kamino should provision routing and isolated networks for this pod."
                    : "Router automation is unavailable until an admin configures a router VM template."}
                </FieldDescription>
                <RadioGroup
                  value={field.state.value === "none" ? "" : field.state.value}
                  onValueChange={(value) => {
                    if (!value) return
                    setNetworkingMode(value as PodNetworkingMode)
                  }}
                  className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {networkingModeCards.map((mode) => {
                    const disabled =
                      mode.requiresRouter && !routerTemplateConfigured

                    return (
                      <FieldLabel
                        key={mode.value}
                        htmlFor={`create-pod-networking-${mode.value}`}
                        data-disabled={disabled || undefined}
                        className="cursor-pointer data-[disabled=true]:cursor-not-allowed"
                        onClick={(event) => {
                          if (disabled || field.state.value !== mode.value) {
                            return
                          }

                          event.preventDefault()
                          setNetworkingMode("none")
                        }}
                      >
                        <Field
                          orientation="vertical"
                          className="h-full min-h-0 gap-3"
                        >
                          <div className="flex w-full shrink-0 flex-col gap-1.5">
                            <div className="flex w-full items-start justify-between gap-3">
                              <HugeiconsIcon
                                icon={mode.icon}
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              />
                              <RadioGroupItem
                                id={`create-pod-networking-${mode.value}`}
                                value={mode.value}
                                disabled={disabled}
                                onBlur={field.handleBlur}
                                onClick={(event) => {
                                  if (
                                    disabled ||
                                    field.state.value !== mode.value
                                  ) {
                                    return
                                  }

                                  event.preventDefault()
                                  setNetworkingMode("none")
                                }}
                                className="mt-0.5"
                              />
                            </div>
                            <FieldContent className="gap-1.5">
                              <FieldTitle className="text-sm leading-snug">
                                {mode.title}
                              </FieldTitle>
                              <FieldDescription className="text-pretty">
                                {mode.description}
                              </FieldDescription>
                            </FieldContent>
                          </div>
                          {mode.diagram ? (
                            <div
                              className="flex min-h-0 w-full flex-1 items-center justify-center"
                              aria-hidden="true"
                            >
                              <Image
                                src={mode.diagram.light.src}
                                width={mode.diagram.light.width}
                                height={mode.diagram.light.height}
                                layout="constrained"
                                alt=""
                                className="h-auto w-full dark:hidden"
                              />
                              <Image
                                src={mode.diagram.dark.src}
                                width={mode.diagram.dark.width}
                                height={mode.diagram.dark.height}
                                layout="constrained"
                                alt=""
                                className="hidden h-auto w-full dark:block"
                              />
                            </div>
                          ) : null}
                        </Field>
                      </FieldLabel>
                    )
                  })}
                </RadioGroup>
                <FieldError
                  errors={showValidation ? field.state.meta.errors : []}
                />
              </FieldSet>
            )
          }}
        </form.Field>

        <form.Field name="templates" mode="array">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid
            const selectedTemplates = field.state.value.map(
              (template) => template.templateItemId
            )
            const networkingMode = form.getFieldValue("networkingMode")
            const defaultSegmentKey = getDefaultSegmentKey(
              networkingMode,
              networkProfiles
            )
            const dmzProfile = networkProfiles.find(
              (profile) => profile.key === "lan-dmz-router-v1"
            )

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor="templates">Templates</FieldLabel>
                <Combobox
                  multiple
                  autoHighlight
                  items={templateIds}
                  value={selectedTemplates}
                  onValueChange={(value) => {
                    field.handleChange(
                      syncSelectedTemplates(
                        field.state.value,
                        Array.isArray(value) ? value : [],
                        templateOptions,
                        defaultSegmentKey ? { defaultSegmentKey } : undefined
                      )
                    )
                  }}
                >
                  <ComboboxChips
                    ref={anchor}
                    className="w-full"
                    aria-invalid={isInvalid || undefined}
                  >
                    <ComboboxValue>
                      {(values) => (
                        <React.Fragment>
                          {values.map((value: string) => (
                            <ComboboxChip key={value}>
                              {templateNamesById.get(value) ?? value}
                            </ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="templates"
                            name={field.name}
                            placeholder="Search templates"
                            onBlur={field.handleBlur}
                          />
                        </React.Fragment>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={anchor}>
                    <ComboboxEmpty>No items found.</ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>
                          {templateNamesById.get(item) ?? item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>
                  Choose from available Proxmox templates or skip to continue
                  without VMs.
                </FieldDescription>
                <FieldError
                  errors={showValidation ? field.state.meta.errors : []}
                />

                {field.state.value.length > 0 ? (
                  <div className="flex flex-col gap-4 pt-6">
                    {field.state.value.map((templateConfig, index) => (
                      <CreatePodTemplateCard
                        key={templateConfig.templateItemId}
                        form={form}
                        templateConfig={templateConfig}
                        templateIndex={index}
                        submissionAttempts={submissionAttempts}
                        networkingMode={networkingMode}
                        networkSegments={dmzProfile?.segments ?? []}
                        onRemoveTemplate={() => field.removeValue(index)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty className="mt-6 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon
                          icon={Copy02Icon}
                          className="text-muted-foreground"
                        />
                      </EmptyMedia>
                      <EmptyTitle>No templates selected</EmptyTitle>
                      <EmptyDescription>
                        Select one or more templates to configure virtual
                        machines for this pod.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
    </FieldSet>
  )
}
