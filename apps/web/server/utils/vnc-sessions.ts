export type VncSession = {
  node: string
  vmid: number
  port: string
  ticket: string
  password: string
  createdAt: number
}

const sessions = new Map<string, VncSession>()

export function storeSession(id: string, session: VncSession) {
  sessions.set(id, session)
  // Auto-expire after 30s (Proxmox port closes after 10s, but give buffer)
  setTimeout(() => sessions.delete(id), 30_000)
}

export function consumeSession(id: string): VncSession | undefined {
  const session = sessions.get(id)
  if (session) sessions.delete(id)
  return session
}
