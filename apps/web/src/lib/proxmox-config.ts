import { z } from "zod/v4"

const schema = z.object({
  VITE_PVE_NODE_URL: z.url(),
  VITE_PVE_NODE_NAME: z.string().min(1),
  VITE_PVE_VMID: z.coerce.number().int().positive(),
})

const env = schema.parse(import.meta.env)

export const PROXMOX_CONFIG = {
  nodeUrl: env.VITE_PVE_NODE_URL,
  nodeName: env.VITE_PVE_NODE_NAME,
  vmid: env.VITE_PVE_VMID,
} as const
