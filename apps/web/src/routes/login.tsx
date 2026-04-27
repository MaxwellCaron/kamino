import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"
import { LoginForm } from "@/features/auth/components/login-form"
import { ensureAuth } from "@/features/auth/api/auth-api"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { redirect: redirectTo } = Route.useSearch()

  useEffect(() => {
    let cancelled = false

    void ensureAuth()
      .then(() => {
        if (cancelled) return
        router.navigate({ to: redirectTo ?? "/" })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [redirectTo, router])

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
