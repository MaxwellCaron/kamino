export type VncScreenClientHandle = {
  disconnect: () => void
  focus: () => void
  sendCtrlAltDel: () => void
  sendKey: (keysym: number, code: string, down?: boolean) => void
  refreshViewport: () => void
}

export type VncConnectionStatus =
  "connecting" | "connected" | "disconnected" | "expired" | "error"

export type Session = {
  sessionId: string
  url: string
  password: string
}
