import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"
import RFB from "@novnc/novnc"

export const VNC_QUALITY_LEVEL = 6
export const VNC_COMPRESSION_LEVEL = 2

export type VncScreenClientHandle = {
  disconnect: () => void
  focus: () => void
  sendCtrlAltDel: () => void
  sendKey: (keysym: number, code: string, down?: boolean) => void
  refreshViewport: () => void
}

type VncScreenClientProps = React.ComponentProps<"div"> & {
  url: string
  password: string
  onConnect: () => void
  onDisconnect: () => void
  onSecurityFailure: () => void
}

export const VncScreenClient = forwardRef<
  VncScreenClientHandle,
  VncScreenClientProps
>(function VncScreenClientInner(
  {
    url,
    password,
    onConnect,
    onDisconnect,
    onSecurityFailure,
    ...divProps
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<InstanceType<typeof RFB> | null>(null)
  const suppressDisconnectRef = useRef(false)

  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onSecurityFailureRef = useRef(onSecurityFailure)

  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])
  useEffect(() => {
    onDisconnectRef.current = onDisconnect
  }, [onDisconnect])
  useEffect(() => {
    onSecurityFailureRef.current = onSecurityFailure
  }, [onSecurityFailure])

  useImperativeHandle(
    ref,
    () => ({
      disconnect: () => {
        rfbRef.current?.disconnect()
      },
      focus: () => {
        rfbRef.current?.focus()
      },
      sendCtrlAltDel: () => {
        rfbRef.current?.sendCtrlAltDel()
      },
      sendKey: (keysym, code, down) => {
        rfbRef.current?.sendKey(keysym, code, down)
      },
      refreshViewport: () => {
        const rfb = rfbRef.current
        if (!rfb) {
          return
        }
        rfb.scaleViewport = false
        rfb.scaleViewport = true
      },
    }),
    []
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    suppressDisconnectRef.current = false
    const rfb = new RFB(container, url, {
      credentials: { username: "", password, target: "" },
    })
    rfb.focusOnClick = true
    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.qualityLevel = VNC_QUALITY_LEVEL
    rfb.compressionLevel = VNC_COMPRESSION_LEVEL
    rfb.background = "transparent"

    const handleConnect = () => {
      onConnectRef.current()
    }
    const handleDisconnect = () => {
      if (!suppressDisconnectRef.current) {
        onDisconnectRef.current()
      }
    }
    const handleSecurityFailure = () => {
      onSecurityFailureRef.current()
    }

    rfb.addEventListener("connect", handleConnect)
    rfb.addEventListener("disconnect", handleDisconnect)
    rfb.addEventListener("securityfailure", handleSecurityFailure)
    rfbRef.current = rfb

    return () => {
      suppressDisconnectRef.current = true
      rfb.removeEventListener("connect", handleConnect)
      rfb.removeEventListener("disconnect", handleDisconnect)
      rfb.removeEventListener("securityfailure", handleSecurityFailure)
      rfb.disconnect()
      rfbRef.current = null
      container.replaceChildren()
    }
  }, [url, password])

  return <div ref={containerRef} {...divProps} />
})
