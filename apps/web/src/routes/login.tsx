import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import { LoginForm } from "@/components/login-form"
import { ensureAuth } from "@/lib/queries"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    try {
      await ensureAuth()
      throw redirect({ to: search.redirect ?? "/" })
    } catch {
      return
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm
          onSuccess={() => {
            router.navigate({ to: redirectTo ?? "/" })
          }}
        />
      </div>
    </div>
  )
}
