import { IconArrowLeft, IconHome } from "@tabler/icons-react"
import Grainient from "@workspace/ui/components/Grainient"
import { Button } from "@workspace/ui/components/button"
import { useRouter } from "@tanstack/react-router"

export function NotFound() {
  const router = useRouter()

  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-background">
      <Background />
      <div className="relative mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-mono text-[10px] tracking-[0.4em] text-muted-foreground uppercase">
          Status · 404
        </div>

        <BigNumerals />

        <h1 className="mt-10 max-w-md font-heading text-2xl leading-tight md:text-3xl">
          We can't find that page.
        </h1>
        <p className="mt-2 max-w-sm text-sm text-balance text-muted-foreground">
          The link may be old, or the page may have moved. Check the URL or head
          back to somewhere you know.
        </p>

        <div className="mt-8 flex items-center gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={() => router.history.back()}
          >
            <IconArrowLeft data-icon="inline-start" />
            Go back
          </Button>
          <Button size="default" onClick={() => router.navigate({ to: "/" })}>
            <IconHome data-icon="inline-start" />
            Take me home
          </Button>
        </div>
      </div>
    </div>
  )
}

function BigNumerals() {
  return (
    <div className="relative font-heading text-[clamp(8rem,22vw,16rem)] leading-none font-bold tracking-tighter">
      <span>404</span>
    </div>
  )
}

function Background() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Grainient
          className="h-full w-full"
          color1="#404040"
          color2="#10B981"
          color3="#EAB308"
          timeSpeed={0}
          colorBalance={-0.24}
          warpStrength={0.8}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={44}
          blendAngle={0}
          blendSoftness={0.25}
          rotationAmount={530}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={1}
          grainAnimated={false}
          contrast={1}
          gamma={0.7}
          saturation={0.8}
          centerX={-0.04}
          centerY={-0.49}
          zoom={0.9}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 30%, color-mix(in srgb, var(--background) 18%, transparent), transparent 70%), linear-gradient(to bottom, color-mix(in srgb, var(--background) 8%, transparent), color-mix(in srgb, var(--background) 92%, transparent))",
        }}
      />
    </>
  )
}
