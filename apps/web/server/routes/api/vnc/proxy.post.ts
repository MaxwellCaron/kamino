import { defineEventHandler, readBody, createError } from "nitro/h3"
import { randomUUID } from "node:crypto"
import { storeSession } from "../../../utils/vnc-sessions"

export default defineEventHandler(async (event) => {
  const body = await readBody<{ node: string; vmid: number }>(event)

  if (!body?.node || !body?.vmid) {
    throw createError({
      statusCode: 400,
      statusMessage: "node and vmid required",
    })
  }

  const nodeUrl = process.env.PVE_NODE_URL
  const tokenId = process.env.PVE_API_TOKEN_ID
  const tokenSecret = process.env.PVE_API_TOKEN_SECRET

  if (!nodeUrl || !tokenId || !tokenSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: "Proxmox API not configured",
    })
  }

  const authHeader = `PVEAPIToken=${tokenId}=${tokenSecret}`

  const res = await fetch(
    `${nodeUrl}/api2/json/nodes/${body.node}/qemu/${body.vmid}/vncproxy`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "generate-password": "1",
        websocket: "1",
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: res.status,
      statusMessage: `Proxmox vncproxy failed: ${text}`,
    })
  }

  const json = (await res.json()) as {
    data: { port: string; ticket: string; password: string }
  }

  const sessionId = randomUUID()
  storeSession(sessionId, {
    node: body.node,
    vmid: body.vmid,
    port: json.data.port,
    ticket: json.data.ticket,
    password: json.data.password,
    createdAt: Date.now(),
  })

  return { sessionId, password: json.data.password }
})
