import { useElementScrollRestoration, useRouter } from "@tanstack/react-router"
import { useLayoutEffect } from "react"

export function useScrollRestoreOnReady(ready: boolean) {
  const router = useRouter()
  const locationHref = router.latestLocation.href
  const scrollEntry = useElementScrollRestoration({ getElement: () => window })

  useLayoutEffect(() => {
    if (!ready || !scrollEntry) {
      return
    }

    window.scrollTo({
      top: scrollEntry.scrollY,
      left: scrollEntry.scrollX,
      behavior: "instant",
    })
  }, [ready, scrollEntry, locationHref])
}
