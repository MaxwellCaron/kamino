import type { QueryClient } from "@tanstack/react-query"
import { authSessionQueryOptions } from "./auth-queries"
import { redirect } from "@tanstack/react-router"

export async function requireAuthSession({
  context,
  location,
}: {
  context: { queryClient: QueryClient }
  location: { href: string }
}) {
  try {
    const session = await context.queryClient.fetchQuery(
      authSessionQueryOptions
    )
    return { user: session.user }
  } catch {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    })
  }
}
