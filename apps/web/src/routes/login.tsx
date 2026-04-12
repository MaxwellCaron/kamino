import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { LoginForm } from "@/components/login-form"
import { getAccessToken } from "@/lib/queries"

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (getAccessToken()) throw redirect({ to: "/" })
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm
          onSuccess={() => {
            router.navigate({ to: "/" })
          }}
        />
      </div>
    </div>
  )
}
