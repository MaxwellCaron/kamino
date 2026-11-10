import { ChangelogPage } from "@/components/changelog-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"

export const Route = createFileRoute("/_dashboard/changelog")({
  staticData: {
    breadcrumb: { label: "Changelog" },
  },
  head: () => pageTitle("Changelog"),
  component: ChangelogPage,
})
