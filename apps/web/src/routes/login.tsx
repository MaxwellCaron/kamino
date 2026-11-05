import { createFileRoute, redirect } from "@tanstack/react-router"
import { LoginPage } from "@/features/auth/components/login-page"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import { pageTitle } from "@/features/shared/utils/page-title"
import { safeRedirectPath } from "@/features/auth/utils/safe-redirect"
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
