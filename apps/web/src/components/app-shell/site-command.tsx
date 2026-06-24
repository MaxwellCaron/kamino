import * as React from "react"
import { IconSearch } from "@tabler/icons-react"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Button } from "@workspace/ui/components/button"

const SiteCommandDialog = React.lazy(() =>
  import("./site-command-dialog").then((module) => ({
    default: module.SiteCommandDialog,
  }))
)

function preloadSiteCommandDialog() {
  void import("./site-command-dialog")
}

export function CommandManyItems() {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        preloadSiteCommandDialog()
        setOpen((value) => !value)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        onFocus={preloadSiteCommandDialog}
        onPointerEnter={preloadSiteCommandDialog}
        variant="secondary"
        className="w-auto justify-between text-muted-foreground md:w-56 lg:w-72"
        size="sm"
      >
        <div className="flex items-center gap-2">
          <IconSearch />
          <span className="hidden sm:inline">Search Kamino...</span>
        </div>
        <KbdGroup className="hidden sm:flex">
          <Kbd className="bg-foreground/15">Ctrl</Kbd>
          <span>+</span>
          <Kbd className="bg-foreground/15">K</Kbd>
        </KbdGroup>
      </Button>
      {open && (
        <React.Suspense fallback={null}>
          <SiteCommandDialog open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </>
  )
}
