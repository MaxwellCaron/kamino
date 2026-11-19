import { useLayoutEffect, useRef, useState } from "react"

export function useDialogSessionKey({ open }: { open: boolean }) {
  const [sessionKey, setSessionKey] = useState(0)
  const prevOpenRef = useRef(open)

  useLayoutEffect(() => {
    if (open && !prevOpenRef.current) {
      setSessionKey((current) => current + 1)
    }
    prevOpenRef.current = open
  }, [open])

  return sessionKey
}
