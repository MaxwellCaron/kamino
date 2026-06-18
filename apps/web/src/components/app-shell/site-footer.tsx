import { Image } from "@unpic/react"
import { Separator } from "@workspace/ui/components/separator"

export function SiteFooter() {
  return (
    <>
      <div className="-mx-1 bg-sidebar px-1">
        <div className="h-(--header-height) rounded-b-2xl bg-background" />
      </div>
      <div className="relative z-50 -mr-2 -mb-2 -ml-1 h-100 overflow-hidden bg-sidebar p-6">
        <div className="max-w-4xl">
          <h1 className="-mt-10 text-[10rem] font-extrabold tracking-tight text-balance text-foreground/90">
            Kamino
          </h1>
          <Separator className="max-w-" />
        </div>
        <Image
          src="kamino.svg"
          height={500}
          width={500}
          className="absolute right-[-4vw] bottom-[-10svh] hidden overflow-hidden opacity-50 xl:block"
        />
      </div>
    </>
  )
}
