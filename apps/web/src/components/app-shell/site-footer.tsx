import { Image } from "@unpic/react"
import { buttonVariants } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

export function SiteFooter() {
  return (
    <footer className="shrink-0">
      <Separator />
      <div className="relative h-20 overflow-hidden p-6">
        <div className="max-w-4xl">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Kamino, created by
            <a
              href="https://github.com/MaxwellCaron"
              target="_blank"
              className={`${buttonVariants({ variant: "link" })} px-1! text-foreground!`}
            >
              MaxwellCaron
            </a>
          </p>
        </div>
        <Image
          src="/kamino.svg"
          height={175}
          width={175}
          className="absolute -right-14 -bottom-20 hidden opacity-50 xl:block"
        />
      </div>
    </footer>
  )
}
