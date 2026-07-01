import { createFileRoute } from "@tanstack/react-router"
import { DocumentationPage } from "@/features/documentation/components/documentation-page"
import { pageTitle } from "@/features/shared/utils/page-title"
import adminGuideContent from "@/features/documentation/content/admin-guide.md?raw"

export const Route = createFileRoute("/_dashboard/admin/docs")({
  staticData: {
    breadcrumb: { label: "Administrator Guide" },
  },
  head: () => pageTitle("Administrator Guide"),
  component: AdminGuidePage,
})

function AdminGuidePage() {
  return <DocumentationPage content={adminGuideContent} />
}
