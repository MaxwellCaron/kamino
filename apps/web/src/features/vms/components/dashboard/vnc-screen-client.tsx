import { VncScreen } from "react-vnc"
import type { Ref } from "react"
import type { VncScreenHandle, VncScreenProps } from "react-vnc"

export function VncScreenClient({
  ref,
  ...props
}: VncScreenProps & { ref?: Ref<VncScreenHandle> }) {
  return <VncScreen ref={ref} {...props} />
}
