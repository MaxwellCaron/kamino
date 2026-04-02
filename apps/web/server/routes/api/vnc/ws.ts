import { defineWebSocketHandler } from "nitro/h3"
import WebSocket from "ws"
import { consumeSession } from "../../../utils/vnc-sessions"

type PeerState = {
  pveWs: WebSocket | null
  buffer: (string | Buffer | ArrayBuffer | Uint8Array)[]
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
    console.error("[vnc-ws] invalid/expired session:", sessionId)
    peer.close(1008, "Invalid or expired session")
    return
  }

  const nodeUrl = process.env.PVE_NODE_URL!
  const tokenId = process.env.PVE_API_TOKEN_ID!
  const tokenSecret = process.env.PVE_API_TOKEN_SECRET!

  const pveWsUrl =
    `${nodeUrl.replace("https://", "wss://")}/api2/json/nodes/${session.node}` +
    `/qemu/${session.vmid}/vncwebsocket` +
    `?port=${session.port}&vncticket=${encodeURIComponent(session.ticket)}`

  console.log("[vnc-ws] connecting to Proxmox:", pveWsUrl)

  const pveWs = new WebSocket(pveWsUrl, {
    headers: {
      Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}`,
    },
    rejectUnauthorized: false,
  })

  const state = connections.get(peer.id)!
  state.pveWs = pveWs
  state.initialized = true

  pveWs.on("open", () => {
    console.log(
      "[vnc-ws] Proxmox WS connected, flushing",
      state.buffer.length,
      "buffered messages"
    )
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
    console.log("[vnc-ws] Proxmox WS closed:", code, reason?.toString())
    connections.delete(peer.id)
    peer.close()
  })

  pveWs.on("error", (err) => {
    console.error("[vnc-ws] Proxmox WS error:", err.message)
    connections.delete(peer.id)
    peer.close()
  })
}

export default defineWebSocketHandler({
  open(peer) {
    console.log(
      "[vnc-ws] client connected:",
      peer.id,
      "— waiting for session init message"
    )
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
          : (message.text?.() ??
            new TextDecoder().decode(message.rawData ?? message))
      console.log("[vnc-ws] received init message:", text)
      try {
        const { sessionId } = JSON.parse(text)
        if (!sessionId) throw new Error("missing sessionId")
        initBridge(peer, sessionId)
      } catch {
        console.error("[vnc-ws] invalid init message:", text)
        peer.close(1008, "Invalid init message — expected JSON with sessionId")
      }
      return
    }

    // Forward subsequent messages to Proxmox
    const data = message.rawData ?? message
    if (state.ready && state.pveWs?.readyState === WebSocket.OPEN) {
      state.pveWs.send(data)
    } else {
      state.buffer.push(data)
    }
  },

  close(peer) {
    console.log("[vnc-ws] client disconnected:", peer.id)
    const state = connections.get(peer.id)
    if (state?.pveWs) {
      state.pveWs.close()
    }
    connections.delete(peer.id)
  },

  error(peer) {
    console.error("[vnc-ws] client error:", peer.id)
    const state = connections.get(peer.id)
    if (state?.pveWs) {
      state.pveWs.close()
    }
    connections.delete(peer.id)
  },
})
