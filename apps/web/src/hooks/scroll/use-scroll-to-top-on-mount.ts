import { useEffect } from "react"

export function useScrollToTopOnMount() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [])
}
