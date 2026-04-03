import { defineWebSocketHandler } from "nitro/h3"
import WebSocket from "ws"
import { getProxmoxConfig } from "../../../utils/proxmox"
import { consumeSession } from "../../../utils/vnc-sessions"

type PeerState = {
  pveWs: WebSocket | null
  buffer: Array<string | Buffer | ArrayBuffer | Uint8Array>
  ready: boolean
  initialized: boolean
}

const connections = new Map<string, PeerState>()

function initBridge(
  peer: {
    id: string
    send: (data: any) => void
    close: (code?: number, reason?: string) => void
  },
  sessionId: string
) {
  const session = consumeSession(sessionId)
  if (!session) {
    peer.close(1008, "Invalid or expired session")
    return
  }

  const { nodeUrl, authHeader } = getProxmoxConfig()

  const pveWsUrl =
    `${nodeUrl.replace("https://", "wss://")}/api2/json/nodes/${session.node}` +
    `/qemu/${session.vmid}/vncwebsocket` +
    `?port=${session.port}&vncticket=${encodeURIComponent(session.ticket)}`

  const pveWs = new WebSocket(pveWsUrl, {
    headers: {
      Authorization: authHeader,
    },
    rejectUnauthorized: false,
  })

  const state = connections.get(peer.id)!
  state.pveWs = pveWs
  state.initialized = true

  pveWs.on("open", () => {
    state.ready = true
    for (const msg of state.buffer) {
      pveWs.send(msg)
    }
    state.buffer = []
  })

  pveWs.on("message", (data) => {
    try {
      peer.send(data as Buffer)
    } catch (e) {
      console.error("[vnc-ws] error forwarding to client:", e)
    }
  })

  pveWs.on("close", (code, reason) => {
    connections.delete(peer.id)
    peer.close()
  })

  pveWs.on("error", (err) => {
    connections.delete(peer.id)
    peer.close()
  })
}

export default defineWebSocketHandler({
  open(peer) {
    connections.set(peer.id, {
      pveWs: null,
      buffer: [],
      ready: false,
      initialized: false,
    })
  },

  message(peer, message) {
    const state = connections.get(peer.id)
    if (!state) return

    // First message must be the session ID
    if (!state.initialized) {
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message.rawData as AllowSharedBufferSource)
      try {
        const { sessionId } = JSON.parse(text)
        if (!sessionId) throw new Error("missing sessionId")
        initBridge(peer, sessionId)
      } catch {
        peer.close(1008, "Invalid init message — expected JSON with sessionId")
      }
      return
    }

    // Forward subsequent messages to Proxmox
    const data = (message.rawData ?? message) as string | Buffer
    if (state.ready && state.pveWs?.readyState === WebSocket.OPEN) {
      state.pveWs.send(data)
    } else {
      state.buffer.push(data)
    }
  },

  close(peer) {
    const state = connections.get(peer.id)
    if (state?.pveWs) {
      state.pveWs.close()
    }
    connections.delete(peer.id)
  },

  error(peer) {
    const state = connections.get(peer.id)
    if (state?.pveWs) {
      state.pveWs.close()
    }
    connections.delete(peer.id)
  },
})
