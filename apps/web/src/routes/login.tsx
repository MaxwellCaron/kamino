import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import { AsciiArt } from "@workspace/ui/components/ascii-art"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LoginForm } from "@/features/auth/components/login-form"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import { GrainientBackground } from "@/components/grainient-background"
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

function LoginPage() {
  const router = useRouter()
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <main className="bg-card md:bg-sidebar md:py-6 md:pr-2 md:pl-6">
      <div className="relative overflow-hidden md:rounded-3xl md:shadow md:ring-1 md:ring-border">
        <GrainientBackground />
        <AsciiArt
          src="kamino.svg"
          charset="pipes"
          resolution={300}
          color="var(--muted-foreground)"
          animationStyle="none"
          objectFit="cover"
          className="pointer-events-none absolute bottom-[-18svh] left-[-12vw] hidden aspect-square w-[min(94vw,72rem)] md:block"
        />

        <div className="relative grid items-center md:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)] md:p-10">
          <section aria-label="Kamino" className="hidden md:block" />

          <section>
            <Card className="h-screen rounded-none shadow-none ring-0 md:h-[89.5svh] md:rounded-4xl md:p-6">
              <CardContent className="my-auto">
                <LoginForm
                  onSuccess={() => {
                    router.navigate({ to: redirectTo ?? "/" })
                  }}
                />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  )
}
