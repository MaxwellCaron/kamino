import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Home03Icon } from "@hugeicons/core-free-icons"
import { buttonVariants } from "@workspace/ui/components/button"
import { Link } from "@tanstack/react-router"
import { GrainientBackground } from "@/components/grainient-background"

export function NotFound() {
  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-background">
      <GrainientBackground />
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
          <Link to=".." className={buttonVariants({ variant: "outline" })}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
            Go back
          </Link>
          <Link to="/" className={buttonVariants()}>
            <HugeiconsIcon icon={Home03Icon} data-icon="inline-start" />
            Take me home
          </Link>
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
