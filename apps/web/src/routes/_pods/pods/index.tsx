import { BrowsePodsPage } from "@/features/pods/components/browse/browse-pods-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/")({
  head: () => pageTitle("Pods"),
  component: BrowsePodsPage,
})
