import { forwardRef } from "react"
import { VncScreen } from "react-vnc"
import type { VncScreenHandle, VncScreenProps } from "react-vnc"

export const VncScreenClient = forwardRef<VncScreenHandle, VncScreenProps>(
  function VncScreenClientInner(props, ref) {
    return <VncScreen ref={ref} {...props} />
  }
)
