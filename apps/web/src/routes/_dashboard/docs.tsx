import { DocumentationPage } from "@/components/documentation/documentation-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import userGuideContent from "@/lib/documentation/content/user-guide.md?raw"

export const Route = createFileRoute("/_dashboard/docs")({
  staticData: {
    breadcrumb: { label: "User Guide" },
  },
  head: () => pageTitle("User Guide"),
  component: UserGuidePage,
})

function UserGuidePage() {
  return <DocumentationPage content={userGuideContent} />
}
