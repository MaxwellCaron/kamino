import { getRouteApi, useRouter } from "@tanstack/react-router"
import { AsciiArt } from "@workspace/ui/components/ascii-art"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LoginForm } from "@/features/auth/components/login-form"
import { safeRedirectPath } from "@/features/auth/utils/safe-redirect"
import { GrainientBackground } from "@/components/grainient-background"

const loginRouteApi = getRouteApi("/login")

export function LoginPage() {
  const router = useRouter()
  const { redirect: redirectTo } = loginRouteApi.useSearch()

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
                    router.navigate({ to: safeRedirectPath(redirectTo) })
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
