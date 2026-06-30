import { createFileRoute } from "@tanstack/react-router"
import { ChangelogPage } from "@/features/changelog/components/changelog-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/changelog")({
  staticData: {
    breadcrumb: { label: "Changelog" },
  },
  head: () => pageTitle("Changelog"),
  component: ChangelogPage,
})
