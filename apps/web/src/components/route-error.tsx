import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { FullPageStatus } from "@/components/full-page-status"

export function RouteError(_props: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      await router.invalidate()
    } catch {
      // Swallow: the route error boundary remains the failure UI.
    } finally {
      setRetrying(false)
    }
  }

  return (
    <FullPageStatus
      statusCode="500"
      title="Something went wrong."
      description="Kamino couldn't load this page. Try the request again, go back, or return home."
      retryAction={
        <Button
          variant="link"
          disabled={retrying}
          onClick={() => {
            void handleRetry()
          }}
        >
          Try again
        </Button>
      }
    />
  )
}
