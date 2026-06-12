import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import { LoginPage } from "@/features/auth/components/login-page"
import { pageTitle } from "@/features/shared/utils/page-title"

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

    throw redirect({ to: search.redirect ?? "/" })
  },
  head: () => pageTitle("Sign In"),
  component: LoginPage,
})
