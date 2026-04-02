export function getProxmoxConfig() {
  const nodeUrl = process.env.PVE_NODE_URL
  const tokenId = process.env.PVE_API_TOKEN_ID
  const tokenSecret = process.env.PVE_API_TOKEN_SECRET

  if (!nodeUrl || !tokenId || !tokenSecret) {
    throw new Error("Proxmox API not configured")
  }

  return {
    nodeUrl,
    tokenId,
    tokenSecret,
    authHeader: `PVEAPIToken=${tokenId}=${tokenSecret}`,
  }
}
