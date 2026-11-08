import { ensureAuth } from "@/lib/auth/auth-session"
import { queryOptions } from "@tanstack/react-query"

export const authSessionQueryOptions = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: ensureAuth,
  retry: false,
})
