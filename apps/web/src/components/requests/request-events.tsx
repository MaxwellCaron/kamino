import { useRequestsStream } from "@/hooks/use-requests-stream"
import { Route } from "@/routes/_dashboard"
import { canAccessRequestQueue } from "@/lib/queries"

export function RequestEvents() {
  const { user } = Route.useRouteContext()
  const canAccess = canAccessRequestQueue(user.management_permissions)

  useRequestsStream(canAccess)

  return null
}
