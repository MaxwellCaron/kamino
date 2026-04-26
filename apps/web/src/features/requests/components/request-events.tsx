import { useRequestsStream } from "@/features/requests/hooks/use-requests-stream"
import { Route } from "@/routes/_dashboard"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"

export function RequestEvents() {
  const { user } = Route.useRouteContext()
  const canAccess = canAccessRequestQueue(user.management_permissions)

  useRequestsStream(canAccess)

  return null
}
