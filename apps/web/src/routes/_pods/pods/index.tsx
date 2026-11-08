import { BrowsePodsPage } from "@/components/pods/browse/browse-pods-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"

export const Route = createFileRoute("/_pods/pods/")({
  head: () => pageTitle("Pods"),
  component: BrowsePodsPage,
})
