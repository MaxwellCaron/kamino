import { createFileRoute, redirect } from "@tanstack/react-router"
import { LoginPage } from "@/components/auth/login-page"
import { authSessionQueryOptions } from "@/lib/auth/auth-queries"
import { pageTitle } from "@/lib/app-shell/page-title"
import { safeRedirectPath } from "@/lib/auth/safe-redirect"
import { z } from "zod"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: async ({ context, search }) => {
    try {
      await context.queryClient.fetchQuery(authSessionQueryOptions)
    } catch {
      return
    }

    throw redirect({ to: safeRedirectPath(search.redirect) })
  },
  head: () => pageTitle("Sign In"),
  component: LoginPage,
})
