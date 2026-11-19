import { z } from "zod"

export const vmNetworkInterfaceSchema = z.object({
  bridge: z.string().trim().min(1, "Network bridge is required"),
  model: z.string().trim().min(1, "NIC model is required"),
  vlan_tag: z.number().int().min(1).max(4094).optional(),
  firewall: z.boolean(),
})

export const vmHardwareConfigurationSchema = z.object({
  ostype: z.string().trim().min(1, "OS type is required"),
  bios: z.string().trim().min(1, "BIOS is required"),
  machine: z.string().trim().min(1, "Machine type is required"),
  scsi: z.string().trim().min(1, "SCSI controller is required"),
  sockets: z.number().int().min(1, "At least one socket is required"),
  cores: z.number().int().min(1, "At least one core is required"),
  cpu_type: z.string().trim().min(1, "CPU type is required"),
  memory: z.number().int().min(1, "Memory must be at least 1 GB"),
  balloon: z.number().int().min(0, "Balloon must be 0 GB or higher"),
  storage: z.string().trim().min(1, "Disk storage is required"),
  disk_size: z.number().int().min(1, "Disk size must be at least 1 GB"),
})
