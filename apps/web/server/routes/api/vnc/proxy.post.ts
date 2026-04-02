import { randomUUID } from "node:crypto"
import { HTTPError, defineEventHandler, readBody } from "nitro/h3"
import { getProxmoxConfig } from "../../../utils/proxmox"
import { storeSession } from "../../../utils/vnc-sessions"

export default defineEventHandler(async (event) => {
  const body = await readBody<{ node: string; vmid: number }>(event)

  if (!body?.node || !body.vmid) {
    throw new HTTPError({
      statusCode: 400,
      statusMessage: "node and vmid required",
    })
  }

  const { nodeUrl, authHeader } = getProxmoxConfig()

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
    throw new HTTPError({
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
