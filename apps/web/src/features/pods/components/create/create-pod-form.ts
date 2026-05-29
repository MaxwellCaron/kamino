import { useForm } from "@tanstack/react-form"
import { uuid } from "@workspace/ui/lib/utils"
import { useMemo } from "react"
import { z } from "zod"
import type { PodTemplateOption } from "@/features/pods/api/create-pod-api"

const vmNameSchema = z
  .string()
  .trim()
  .min(1, "VM name is required.")
  .max(63, "VM name must be at most 63 characters.")
  .regex(
    /^[A-Za-z0-9-]+$/,
    "VM name can only contain ASCII letters, digits, and -."
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

const createPodTemplateSchema = z
  .object({
    templateItemId: z.string().uuid("Select a valid template."),
    templateName: z.string().trim().min(1, "Template name is required."),
    templateDiskGb: z.number().min(0),
    vms: z
      .array(createPodVmSchema)
      .min(1, "Add at least one VM for this template.")
      .max(5, "You can add up to 5 VMs per template."),
  })
  .superRefine((template, ctx) => {
    const minimumStorageGb = Math.max(10, Math.ceil(template.templateDiskGb))

    template.vms.forEach((vm, index) => {
      if (minimumStorageGb > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["vms", index, "storageGb"],
          message: "Template disk exceeds the 100 GB pod storage limit.",
        })
        return
      }

      if (vm.storageGb >= minimumStorageGb) return

      ctx.addIssue({
        code: "custom",
        path: ["vms", index, "storageGb"],
        message: `Storage must be at least ${minimumStorageGb} GB for this template.`,
      })
    })
  })

const createPodFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Pod name is required.")
    .max(63, "Pod name must be at most 63 characters.")
    .regex(
      /^[A-Za-z][A-Za-z0-9-]*$/,
      "Pod name must start with a letter and can only contain ASCII letters, digits, and -."
    ),
  includeRouter: z.boolean(),
  templates: z.array(createPodTemplateSchema),
})

export type CreatePodFormValues = z.infer<typeof createPodFormSchema>

type UseCreatePodFormOptions = {
  onSubmit?: (values: CreatePodFormValues) => Promise<void> | void
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createTemplateVm(
  template: Pick<
    PodTemplateOption,
    "name" | "cpu_count" | "disk_gb" | "memory_mb"
  >
): CreatePodFormValues["templates"][number]["vms"][number] {
  const cpuCount = clampNumber(template.cpu_count ?? 2, 1, 8)
  const memoryGb = clampNumber(
    Math.ceil((template.memory_mb ?? 4096) / 1024),
    1,
    32
  )
  const storageGb = clampNumber(Math.ceil(template.disk_gb ?? 50), 10, 100)

  return {
    id: uuid(),
    name: template.name,
    cpuCount,
    memoryGb,
    storageGb,
  }
}

function createTemplateConfig(
  template: Pick<
    PodTemplateOption,
    "cpu_count" | "disk_gb" | "id" | "memory_mb" | "name"
  >,
  vmCount = 1
): CreatePodFormValues["templates"][number] {
  return {
    templateItemId: template.id,
    templateName: template.name,
    templateDiskGb: template.disk_gb ?? 0,
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
  selectedTemplateIds: Array<string>,
  templateOptions: Array<
    Pick<
      PodTemplateOption,
      "cpu_count" | "disk_gb" | "id" | "memory_mb" | "name"
    >
  >
) {
  return selectedTemplateIds.flatMap((templateItemId) => {
    const currentTemplate = currentTemplates.find(
      (current) => current.templateItemId === templateItemId
    )

    if (currentTemplate) return currentTemplate

    const template = templateOptions.find(
      (option) => option.id === templateItemId
    )
    return template ? [createTemplateConfig(template)] : []
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
