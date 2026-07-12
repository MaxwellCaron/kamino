import { Image } from "@unpic/react"
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
import { HugeiconsIcon } from "@hugeicons/react"
import { Router02Icon, RouterIcon } from "@hugeicons/core-free-icons"
import { getPodDefaultVmSegmentKey } from "./create-pod-form"
import type { CreatePodFormApi, PodNetworkingMode } from "./create-pod-form"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import type { IconSvgElement } from "@hugeicons/react"

type CreatePodNetworkingSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
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
    description: "Standard router with 1:1 NAT from WAN to LAN.",
    icon: Router02Icon,
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
      "Router with 1:1 NAT from WAN to DMZ in addition to an isolated LAN segment.",
    icon: RouterIcon,
    requiresRouter: true,
    diagram: {
      light: { src: "/lan_dmz_light.png", width: 456, height: 456 },
      dark: { src: "/lan_dmz_dark.png", width: 450, height: 456 },
      alt: "",
    },
  },
]

export function CreatePodNetworkingSection({
  form,
  submissionAttempts,
  networkProfiles,
  routerTemplateConfigured = true,
}: CreatePodNetworkingSectionProps) {
  return (
    <FieldSet className="w-full">
      <FieldDescription>
        {routerTemplateConfigured
          ? "Choose how Kamino should provision routing and isolated networks for this pod."
          : "Router automation is unavailable until an admin configures a router VM template."}
      </FieldDescription>
      <FieldGroup>
        <form.Field name="networkingMode">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid

            const setNetworkingMode = (nextMode: PodNetworkingMode) => {
              field.handleChange(nextMode)

              if (nextMode === "lan-dmz-router-v1") {
                const defaultSegmentKey = getPodDefaultVmSegmentKey(
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
              <Field data-invalid={isInvalid || undefined}>
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
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
    </FieldSet>
  )
}
