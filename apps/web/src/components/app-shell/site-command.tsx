"use client"

import * as React from "react"
import { IconSearch } from "@tabler/icons-react"

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

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        onFocus={preloadSiteCommandDialog}
        onPointerEnter={preloadSiteCommandDialog}
        variant="secondary"
        className="w-auto justify-start text-muted-foreground md:w-56 lg:w-72"
        size="sm"
      >
        <IconSearch />
        <span className="hidden sm:inline">Search Kamino...</span>
      </Button>
      {open && (
        <React.Suspense fallback={null}>
          <SiteCommandDialog open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </>
  )
}
