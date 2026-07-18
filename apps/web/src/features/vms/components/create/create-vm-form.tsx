import {
  Field,
  createFormHook,
  createFormHookContexts,
  formOptions,
} from "@tanstack/react-form"
import { z } from "zod"
import { vmNameSchema } from "../../utils/vm-name"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { CreateVMParams } from "@/features/vms/types/vm-types"
import { optionalVmidSchema } from "@/components/vms/vmid-schema"
import { uuid } from "@/features/shared/utils/uuid"

const createVmMethodSchema = z.enum(["template", "iso", "upload"])

export type CreateVmMethod = z.infer<typeof createVmMethodSchema>

export const networkInterfaceSchema = z.object({
  id: z.string().min(1),
  bridge: z
    .string()
    .trim()
    .min(1, "Network bridge is required")
    .default("vmbr0"),
  model: z.string().trim().min(1, "NIC model is required").default("virtio"),
  vlan_tag: z.number().int().min(1).max(4094).optional(),
  firewall: z.boolean().default(true),
})

export const optionalVmNameSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? "" : value),
  z.union([vmNameSchema, z.literal("")])
)

const templateConfigurationSchema = z.object({
  template_id: z.string().trim().min(1, "Template is required"),
  target_folder_id: z.string().trim().min(1, "Destination folder is required"),
  node: z.string().trim().optional(),
  vmid: optionalVmidSchema,
  name: optionalVmNameSchema,
})

const isoConfigurationSchema = z.object({
  target_folder_id: z.string().trim().min(1, "Destination folder is required"),
  node: z.string().trim().optional(),
  vmid: optionalVmidSchema,
  name: vmNameSchema,
  ostype: z.string().trim().min(1, "OS type is required"),
  iso_storage: z.string().trim().min(1, "ISO storage is required"),
  iso: z.string().trim().min(1, "ISO image is required"),
  bios: z.string().trim().min(1, "BIOS is required"),
  machine: z.string().trim().min(1, "Machine type is required"),
  scsi: z.string().trim().min(1, "SCSI controller is required"),
  sockets: z.number().int().min(1, "At least one socket is required"),
  cores: z.number().int().min(1, "At least one core is required"),
  cpu_type: z.string().trim().min(1, "CPU type is required"),
  storage: z.string().trim().min(1, "Disk storage is required"),
  disk_size: z
    .number()
    .int()
    .min(1, "Disk size must be at least 1 GB")
    .max(100, "Disk size must be at most 100 GB"),
  memory: z
    .number()
    .int()
    .min(1, "Memory must be at least 1 GB")
    .max(24, "Memory must be at most 24 GB"),
  balloon: z.number().int().min(0, "Balloon must be 0 GB or higher"),
  networks: z
    .array(networkInterfaceSchema)
    .min(1, "At least one network interface is required")
    .max(5, "No more than 5 network interfaces are permitted."),
})

export const createVmFormSchema = z
  .object({
    method: createVmMethodSchema.default("template"),
    template_id: z.string().trim().optional(),
    target_folder_id: z.string().trim().default(""),
    full_clone: z.boolean().default(true),
    node: z.string().trim().default(""),
    vmid: optionalVmidSchema,
    name: optionalVmNameSchema,
    ostype: z.string().trim().default("l26"),
    iso_storage: z.string().trim().optional(),
    iso: z.string().trim().optional(),
    bios: z.string().trim().default("seabios"),
    machine: z.string().trim().default("pc"),
    scsi: z.string().trim().default("virtio-scsi-single"),
    sockets: z.number().int().min(1).default(1),
    cores: z.number().int().min(1).default(1),
    cpu_type: z.string().trim().default("x86-64-v2-AES"),
    memory: z.number().int().min(1).default(2),
    balloon: z.number().int().min(0).default(0),
    storage: z.string().trim().optional(),
    disk_size: z.number().int().min(1).default(32),
    networks: z
      .array(networkInterfaceSchema)
      .default([
        { id: uuid(), bridge: "vmbr0", model: "virtio", firewall: true },
      ]),
    upload_filename: z.string().trim().optional(),
    upload_notes: z.string().trim().max(256).optional(),
  })
  .superRefine((value, ctx) => {
    const result =
      value.method === "template"
        ? templateConfigurationSchema.safeParse(value)
        : value.method === "iso"
          ? isoConfigurationSchema.safeParse(value)
          : null

    if (!result || result.success) return

    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      })
    }
  })

export type CreateVmFormValues = z.infer<typeof createVmFormSchema>

function getCreateVmFormErrors(values: CreateVmFormValues) {
  const result = createVmFormSchema.safeParse(values)

  if (result.success) return undefined

  const fields: any = {}

  for (const issue of result.error.issues) {
    const path = issue.path.join(".")
    if (fields[path]) continue
    fields[path] = issue.message
  }

  return { fields }
}

const defaultValues: CreateVmFormValues = {
  method: "template",
  template_id: "",
  target_folder_id: "",
  full_clone: false,
  node: "",
  vmid: 0,
  name: "",
  ostype: "l26",
  iso_storage: "",
  iso: "",
  bios: "seabios",
  machine: "pc",
  scsi: "virtio-scsi-single",
  sockets: 1,
  cores: 1,
  cpu_type: "x86-64-v2-AES",
  memory: 2,
  balloon: 0,
  storage: "",
  disk_size: 32,
  networks: [{ id: uuid(), bridge: "vmbr0", model: "virtio", firewall: true }],
  upload_filename: "",
  upload_notes: "",
}

export const createVmFormOptions = formOptions({
  defaultValues,
  validators: {
    onSubmit: ({ value }) => getCreateVmFormErrors(value),
  },
})

const { fieldContext, formContext } = createFormHookContexts()

export const { useAppForm: useCreateVmForm, withForm: withCreateVmForm } =
  createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
      AppField: Field,
    },
    formComponents: {},
  })

export type CreateVmFormApi = ReturnType<typeof useCreateVmForm>

export type VmTemplateOption = {
  id: string
  label: string
  name: string
  node: string
  vmid: number
}

export function getVmTemplateOptions(
  tree: Array<ApiTreeNode> | undefined
): Array<VmTemplateOption> {
  if (!tree) return []

  const templates: Array<VmTemplateOption> = []

  function walk(nodes: Array<ApiTreeNode>) {
    for (const entry of nodes) {
      if (entry.kind === "vm" && entry.vm?.is_template) {
        templates.push({
          id: entry.id,
          label: `${entry.name} (${entry.vm.node}/${entry.vm.vmid})`,
          name: entry.name,
          node: entry.vm.node,
          vmid: entry.vm.vmid,
        })
      }

      if (entry.children?.length) walk(entry.children)
    }
  }

  walk(tree)

  return templates.sort((left, right) => left.label.localeCompare(right.label))
}

export function getSelectedTemplate(
  templateOptions: Array<VmTemplateOption>,
  templateId: string | null | undefined
) {
  if (!templateId) return undefined
  return templateOptions.find(
    (template) => template.id === templateId || template.name === templateId
  )
}

export function parseNumberInput(value: string, fallback: number) {
  const next = Number.parseInt(value, 10)
  return Number.isNaN(next) ? fallback : next
}

export function parseOptionalNumberInput(value: string) {
  const next = Number.parseInt(value, 10)
  return Number.isNaN(next) ? undefined : next
}

export function getFirstIssueMessage(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? undefined : result.error.issues[0]?.message
}

function optionalString(value: string | undefined) {
  const next = value?.trim()
  return next ? next : undefined
}

export function toCreateVmParams(values: CreateVmFormValues): CreateVMParams {
  return {
    target_folder_id: values.target_folder_id,
    node: values.node,
    vmid: values.vmid,
    name: values.name,
    ostype: values.ostype,
    iso: optionalString(values.iso),
    bios: values.bios,
    machine: values.machine,
    scsi: values.scsi,
    sockets: values.sockets,
    cores: values.cores,
    cpu_type: values.cpu_type,
    memory: values.memory,
    balloon: values.balloon,
    storage: optionalString(values.storage),
    disk_size: values.disk_size,
    networks: values.networks.map((network) => ({
      bridge: network.bridge,
      model: network.model,
      vlan_tag: network.vlan_tag,
      firewall: network.firewall,
    })),
  }
}
