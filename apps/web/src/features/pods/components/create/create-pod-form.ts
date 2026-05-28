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
    .max(5, "You can add up to 5 VMs per template."),
})

const createPodFormSchema = z.object({
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

export type CreatePodFormValues = z.infer<typeof createPodFormSchema>

type UseCreatePodFormOptions = {
  onSubmit?: (values: CreatePodFormValues) => Promise<void> | void
}

export function createTemplateVm(
  template: CreatePodTemplateOption
): CreatePodFormValues["templates"][number]["vms"][number] {
  return {
    id: uuid(),
    name: template,
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
    vms: Array.from({ length: vmCount }, () => createTemplateVm(template)),
  }
}

function createDefaultCreatePodValues(): CreatePodFormValues {
  return {
    name: "new-pod",
    includeRouter: true,
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
