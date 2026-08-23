import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { useRouterState } from "@tanstack/react-router"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Button } from "@workspace/ui/components/button"
import { SiteCommandDialog } from "./site-command-dialog"

type SiteCommandContextValue = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const SiteCommandContext = React.createContext<SiteCommandContextValue | null>(
  null
)

function useSiteCommand() {
  const context = React.use(SiteCommandContext)
  if (!context) {
    throw new Error("useSiteCommand must be used within SiteCommandProvider")
  }
  return context
}

export function SiteCommandProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const commandMenuAvailable = useRouterState({
    select: (state) => state.location.pathname !== "/login",
  })
  const contextValue = React.useMemo(() => ({ open, setOpen }), [open])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        !commandMenuAvailable ||
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey)
      )
        return

      event.preventDefault()
      setOpen((value) => !value)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [commandMenuAvailable])

  return (
    <SiteCommandContext value={contextValue}>
      {children}
      {commandMenuAvailable && open ? (
        <SiteCommandDialog open onOpenChange={setOpen} />
      ) : null}
    </SiteCommandContext>
  )
}

export function SiteCommandTrigger() {
  const { setOpen } = useSiteCommand()

  return (
    <Button
      onClick={() => setOpen(true)}
      variant="secondary"
      className="w-auto justify-between text-muted-foreground md:w-56 lg:w-72"
      size="sm"
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Search01Icon} />
        <span className="hidden sm:inline">Search Kamino...</span>
      </div>
      <KbdGroup className="hidden sm:flex">
        <Kbd className="bg-foreground/15">Ctrl</Kbd>
        <span>+</span>
        <Kbd className="bg-foreground/15">K</Kbd>
      </KbdGroup>
    </Button>
  )
}
