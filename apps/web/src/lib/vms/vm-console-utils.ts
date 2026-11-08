const SPICE_DISPLAY_TYPES = new Set(["qxl", "virtio", "virtio-gl"])

export const VNC_PERFORMANCE_QUALITY_LEVEL = 0
export const VNC_PERFORMANCE_COMPRESSION_LEVEL = 9

export function supportsNativeSpice(
  guestType: "qemu" | "lxc" | undefined,
  display?: string | null
): boolean {
  return guestType === "qemu" && SPICE_DISPLAY_TYPES.has(display ?? "")
}

export function getVncStreamSettings(): {
  qualityLevel: number
  compressionLevel: number
} {
  return {
    qualityLevel: VNC_PERFORMANCE_QUALITY_LEVEL,
    compressionLevel: VNC_PERFORMANCE_COMPRESSION_LEVEL,
  }
}
