const SPICE_DISPLAY_TYPES = new Set(["qxl", "virtio", "virtio-gl"])

export function supportsNativeSpice(
  guestType: "qemu" | "lxc" | undefined,
  display?: string | null
): boolean {
  return guestType === "qemu" && SPICE_DISPLAY_TYPES.has(display ?? "")
}
