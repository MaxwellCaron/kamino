import { DocumentationPage } from "@/components/documentation/documentation-page"
import adminGuideContent from "@/lib/documentation/content/admin-guide.md?raw"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"

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
