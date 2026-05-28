import { useForm } from "@tanstack/react-form"
import { uuid } from "@workspace/ui/lib/utils"
import { useMemo } from "react"
import { z } from "zod"

export const templateOptions = [
  "kali",
  "1-1NAT-pfsense",
  "debian-13",
  "Server-2025",
  "ubuntu-server-24",
] as const

type CreatePodTemplateOption = (typeof templateOptions)[number]

const vmNameSchema = z
  .string()
  .trim()
  .min(1, "VM name is required.")
  .max(64, "VM name must be at most 64 characters.")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "VM name can only contain ASCII letters, digits, -, and _."
  )

const createPodVmSchema = z.object({
  id: z.string().min(1),
  name: vmNameSchema,
  cpuCount: z
    .number()
    .int("CPU must be a whole number.")
    .min(1, "CPU must be at least 1 vCPU.")
    .max(8, "CPU must be at most 8 vCPU."),
  memoryGb: z
    .number()
    .int("Memory must be a whole number.")
    .min(1, "Memory must be at least 1 GB.")
    .max(32, "Memory must be at most 32 GB."),
  storageGb: z
    .number()
    .int("Storage must be a whole number.")
    .min(10, "Storage must be at least 10 GB.")
    .max(100, "Storage must be at most 100 GB."),
})

const createPodTemplateSchema = z.object({
  template: z.enum(templateOptions),
  vms: z
    .array(createPodVmSchema)
    .min(1, "Add at least one VM for this template.")
    .max(3, "You can add up to 3 VMs per template."),
})

const createPodFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Pod name is required.")
      .max(64, "Pod name must be at most 64 characters.")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Pod name can only contain ASCII letters, digits, -, and _."
      ),
    includeRouter: z.boolean(),
    templates: z
      .array(createPodTemplateSchema)
      .max(templateOptions.length, "Too many templates selected."),
  })
  .superRefine((value, ctx) => {
    const templates = new Set<string>()

    value.templates.forEach((template, index) => {
      if (templates.has(template.template)) {
        ctx.addIssue({
          code: "custom",
          path: ["templates", index, "template"],
          message: "Each template can only be selected once.",
        })
      }

      templates.add(template.template)
    })

    const vmNames = new Map<string, Array<number>>()
    const configuredVmNames = value.templates.flatMap((template) =>
      template.vms.map((vm) => vm.name.trim()).filter(Boolean)
    )

    if (value.includeRouter) {
      configuredVmNames.unshift("router")
    }

    configuredVmNames.forEach((name, index) => {
      vmNames.set(name, [...(vmNames.get(name) ?? []), index])
    })

    for (const [name, indexes] of vmNames) {
      if (indexes.length <= 1) continue

      value.templates.forEach((template, templateIndex) => {
        template.vms.forEach((vm, vmIndex) => {
          if (vm.name.trim() !== name) return

          ctx.addIssue({
            code: "custom",
            path: ["templates", templateIndex, "vms", vmIndex, "name"],
            message: "VM names must be unique in this pod.",
          })
        })
      })
    }
  })

export type CreatePodFormValues = z.infer<typeof createPodFormSchema>

type UseCreatePodFormOptions = {
  onSubmit?: (values: CreatePodFormValues) => Promise<void> | void
}

export function createTemplateVm(): CreatePodFormValues["templates"][number]["vms"][number] {
  return {
    id: uuid(),
    name: "",
    cpuCount: 2,
    memoryGb: 4,
    storageGb: 50,
  }
}

function createTemplateConfig(
  template: CreatePodTemplateOption,
  vmCount = 1
): CreatePodFormValues["templates"][number] {
  return {
    template,
    vms: Array.from({ length: vmCount }, () => createTemplateVm()),
  }
}

function createDefaultCreatePodValues(): CreatePodFormValues {
  return {
    name: "",
    includeRouter: false,
    templates: [],
  }
}

export function syncSelectedTemplates(
  currentTemplates: CreatePodFormValues["templates"],
  selectedTemplates: Array<CreatePodTemplateOption>
) {
  return selectedTemplates.map((template) => {
    const currentTemplate = currentTemplates.find(
      (current) => current.template === template
    )

    if (currentTemplate) return currentTemplate

    return createTemplateConfig(template)
  })
}

export function getReviewVmNames(values: CreatePodFormValues) {
  const vmNames = values.templates.flatMap((template) =>
    template.vms.map((vm) => vm.name.trim() || "Unnamed VM")
  )

  return values.includeRouter ? ["router", ...vmNames] : vmNames
}

export function toNumberInputValue(value: string) {
  if (value === "") return 0
  return Number(value)
}

export function useCreatePodForm({ onSubmit }: UseCreatePodFormOptions = {}) {
  const defaultValues = useMemo(createDefaultCreatePodValues, [])

  return useForm({
    defaultValues,
    validators: {
      onChange: createPodFormSchema,
      onSubmit: createPodFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit?.(value)
    },
  })
}

export type CreatePodFormApi = ReturnType<typeof useCreatePodForm>
